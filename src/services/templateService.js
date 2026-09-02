// src/services/templateService.js
import { supabase, TABLES } from '../lib/supabase';

/**
 * Serviço para gerenciar templates no Supabase
 */
export const templateService = {
  _progressCallback: null,

  /**
   * Busca todos os templates do Supabase
   */
  async fetchAllTemplates() {
    try {
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)  // ✅ Usa fims_templates
        .select('*')
        .order('client_name', { ascending: true });

      if (error) throw error;

      const templates = {};
      const clients = [];

      data.forEach(item => {
        const normalizedSections = this.normalizeSections(item.sections);
        
        const template = {
          clientId: item.client_id,
          clientName: item.client_name,
          sections: normalizedSections,
          version: item.version || '1.0',
          totalItems: normalizedSections.reduce((sum, s) => sum + (s.items ? s.items.length : 0), 0),
          lastUpdated: item.last_updated || item.created_at
        };

        templates[item.client_id] = template;
        templates[item.client_name] = template;
        clients.push({
          id: item.client_id,
          name: item.client_name,
          sections: normalizedSections.length,
          items: template.totalItems,
          lastUpdated: item.last_updated || item.created_at
        });
      });

      return { templates, clients, success: true };
    } catch (error) {
      console.error('Erro ao buscar templates:', error);
      return { templates: {}, clients: [], success: false, error: error.message };
    }
  },

  /**
   * Busca template pelo nome do cliente
   */
  async fetchTemplateByClientName(clientName) {
    try {
      if (!clientName) {
        return { success: false, error: 'Nome do cliente não fornecido' };
      }

      // Busca exata primeiro
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)  // ✅ Usa fims_templates
        .select('*')
        .eq('client_name', clientName)
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        return this.formatTemplate(data[0]);
      }

      // Busca parcial (case insensitive)
      const { data: partialData, error: partialError } = await supabase
        .from(TABLES.TEMPLATES)
        .select('*')
        .ilike('client_name', `%${clientName}%`)
        .limit(1);

      if (partialError) throw partialError;
      
      if (partialData && partialData.length > 0) {
        return this.formatTemplate(partialData[0]);
      }

      return { success: false, error: 'Template não encontrado' };
    } catch (error) {
      console.error('Erro ao buscar template por nome:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Formata template do Supabase
   */
  formatTemplate(item) {
    const normalizedSections = this.normalizeSections(item.sections);
    
    return {
      success: true,
      template: {
        clientId: item.client_id,
        clientName: item.client_name,
        sections: normalizedSections,
        version: item.version || '1.0',
        totalItems: normalizedSections.reduce((sum, s) => sum + (s.items ? s.items.length : 0), 0),
        lastUpdated: item.last_updated || item.created_at
      }
    };
  },

  /**
   * Normaliza sections para formato consistente
   */
  normalizeSections(sections) {
    if (!sections || !Array.isArray(sections)) return [];
    
    return sections.map(section => {
      const sectionId = section.id || `section_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const sectionTitle = section.title || section.name || 'Geral';
      
      const normalizedItems = (section.items || []).map(item => {
        const itemId = item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        return {
          id: itemId,
          label: item.label || item.text || 'Item sem descrição',
          text: item.text || item.label || '',
          weight: item.weight || item.max || 1,
          max: item.max || item.weight || 5,
          note: item.note || ''
        };
      });

      return {
        id: sectionId,
        title: sectionTitle,
        name: sectionTitle,
        items: normalizedItems
      };
    });
  },

  /**
   * Busca template com fallback: localStorage → Supabase → estático → padrão
   */
  async getTemplateWithFallback(clientName) {
    // 1. localStorage (rápido)
    const localTemplate = this.getFromLocalStorage(clientName);
    if (localTemplate && localTemplate.sections && localTemplate.sections.length > 0) {
      console.log(`[templateService] Template no localStorage: ${clientName}`);
      return localTemplate;
    }

    // 2. Supabase
    console.log(`[templateService] Buscando no Supabase: ${clientName}`);
    const result = await this.fetchTemplateByClientName(clientName);
    
    if (result.success && result.template) {
      this.cacheTemplate(result.template);
      console.log(`[templateService] Template do Supabase: ${clientName} (${result.template.totalItems} itens)`);
      return result.template;
    }

    // 3. Estático
    console.log(`[templateService] Usando estático: ${clientName}`);
    return this.getStaticTemplate(clientName);
  },

  /**
   * Busca no localStorage
   */
  getFromLocalStorage(clientName) {
    try {
      const templates = JSON.parse(localStorage.getItem('fims_templates') || '{}');
      
      if (!clientName) return null;
      
      const searchName = clientName.toLowerCase().trim();
      
      // Busca exata
      for (const key of Object.keys(templates)) {
        const template = templates[key];
        if (template.clientName && template.clientName.toLowerCase() === searchName) {
          return template;
        }
      }
      
      // Busca parcial
      for (const key of Object.keys(templates)) {
        const template = templates[key];
        if (template.clientName && 
            (template.clientName.toLowerCase().includes(searchName) || 
             searchName.includes(template.clientName.toLowerCase()))) {
          return template;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  },

  /**
   * Cache no localStorage
   */
  cacheTemplate(template) {
    try {
      const templates = JSON.parse(localStorage.getItem('fims_templates') || '{}');
      templates[template.clientId] = template;
      templates[template.clientName] = template;
      localStorage.setItem('fims_templates', JSON.stringify(templates));
    } catch (error) {
      console.error('Erro ao cachear:', error);
    }
  },

  /**
   * Template estático do clientTemplates.js
   */
  getStaticTemplate(clientName) {
    try {
      const { getTemplate } = require('../data/clientTemplates');
      const staticTemplate = getTemplate(clientName);
      
      if (staticTemplate && staticTemplate.sections && staticTemplate.sections.length > 0) {
        return {
          clientId: 'STATIC',
          clientName: clientName,
          sections: this.normalizeSections(staticTemplate.sections),
          totalItems: staticTemplate.sections.reduce((sum, s) => sum + (s.items ? s.items.length : 0), 0)
        };
      }
    } catch (e) {}
    
    return this.getDefaultTemplate(clientName);
  },

  /**
   * Template padrão
   */
  getDefaultTemplate(clientName) {
    return {
      clientId: 'DEFAULT',
      clientName: clientName || 'Template Padrão',
      sections: [
        {
          id: 'default_section_1',
          title: 'Inspeção Geral',
          name: 'Inspeção Geral',
          items: [
            { id: 'gen_001', label: 'Estado geral das instalações', text: 'Estado geral das instalações', weight: 1, max: 5, note: '' },
            { id: 'gen_002', label: 'Segurança e limpeza', text: 'Segurança e limpeza', weight: 1, max: 5, note: '' }
          ]
        }
      ],
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      totalItems: 2
    };
  },

  /**
   * Sincroniza do Supabase para localStorage
   */
  async syncSupabaseToLocal() {
    try {
      const result = await this.fetchAllTemplates();
      
      if (!result.success) {
        throw new Error(result.error);
      }

      localStorage.setItem('fims_templates', JSON.stringify(result.templates));
      localStorage.setItem('fims_template_clients', JSON.stringify(result.clients));

      console.log(`[templateService] Sincronizados ${result.clients.length} templates`);

      return {
        success: true,
        templates: result.templates,
        clients: result.clients,
        total: result.clients.length
      };
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Verifica conexão
   */
  async checkConnection() {
    try {
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)
        .select('count')
        .limit(1);

      if (error) throw error;
      return { success: true, message: 'Conexão OK' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Callback de progresso (para compatibilidade)
   */
  setProgressCallback(callback) {
    this._progressCallback = callback;
  }
};
