// src/services/dataService.js
import { supabase } from '../lib/supabase';

export const dataService = {
  async fetchInspections() {
    try {
      const { data, error } = await supabase
        .from('fims_inspections')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) { 
        console.warn('[dataService] fetchInspections error:', error.message); 
        return { success: false, inspections: [] }; 
      }
      
      // CORRIGIDO: Incluir colunas do nível da tabela, não apenas o JSONB data
      const inspections = (data || []).map(row => {
        const dataContent = row.data || {};
        return {
          ...dataContent,
          id: row.id,
          // Garantir que estas colunas estão presentes (vêm da tabela, não do JSONB)
          inspector_id: row.inspector_id || dataContent.inspector_id,
          inspector_name: row.inspector_name || dataContent.inspector_name,
          status: row.status || dataContent.status,
          date: row.date || dataContent.date,
          location_name: row.location_name || dataContent.location_name,
          location_id: row.location_id || dataContent.location_id,
          alert_level: row.alert_level || dataContent.alert_level,
          type: row.type || dataContent.type,
          // Metadados
          updated_at: row.updated_at,
          created_at: row.created_at
        };
      });
      
      console.log(`[dataService] Fetched ${inspections.length} inspections`);
      
      // Debug: mostrar inspector_ids
      const withInspector = inspections.filter(i => i.inspector_id);
      if (withInspector.length > 0) {
        const uniqueIds = [...new Set(withInspector.map(i => i.inspector_id))];
        console.log('[dataService] Inspector IDs encontrados:', uniqueIds.slice(0, 10));
      }
      
      return { success: true, inspections };
    } catch (error) { 
      console.error('[dataService] fetchInspections exception:', error); 
      return { success: false, inspections: [] }; 
    }
  },

  async saveInspection(inspection) {
    try {
      const row = { 
        id: String(inspection.id), 
        data: inspection,  // Guardar tudo no JSONB
        inspector_id: String(inspection.inspector_id || ''),  // Também na coluna
        inspector_name: inspection.inspector_name || null,
        status: inspection.status || 'pending',
        date: inspection.date || null,
        location_name: inspection.location_name || null,
        location_id: inspection.location_id ? String(inspection.location_id) : null,
        alert_level: inspection.alert_level || 'ok',
        type: inspection.type || 'inspection',
        updated_at: new Date().toISOString() 
      };
      
      const { error } = await supabase.from('fims_inspections').upsert(row);
      if (error) { 
        console.warn('[dataService] saveInspection error:', error.message); 
        return false; 
      }
      return true;
    } catch (error) { 
      console.error('[dataService] saveInspection exception:', error); 
      return false; 
    }
  },

  async deleteInspection(id) {
    try {
      const { error } = await supabase.from('fims_inspections').delete().eq('id', String(id));
      if (error) { console.warn('[dataService] deleteInspection error:', error.message); return false; }
      return true;
    } catch (error) { console.error('[dataService] deleteInspection exception:', error); return false; }
  },

  async syncInspections(inspections) {
    try {
      if (!inspections || inspections.length === 0) return true;
      
      const rows = inspections.map(i => ({ 
        id: String(i.id), 
        data: i,
        inspector_id: String(i.inspector_id || ''),
        inspector_name: i.inspector_name || null,
        status: i.status || 'pending',
        date: i.date || null,
        location_name: i.location_name || null,
        location_id: i.location_id ? String(i.location_id) : null,
        alert_level: i.alert_level || 'ok',
        type: i.type || 'inspection',
        updated_at: new Date().toISOString() 
      }));
      
      const batchSize = 50;
      let successCount = 0, errorCount = 0;
      
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from('fims_inspections').upsert(batch);
        if (error) { 
          console.warn('[dataService] syncBatch error:', error.message); 
          errorCount += batch.length; 
        } else { 
          successCount += batch.length; 
        }
      }
      
      console.log(`[dataService] Synced ${successCount} inspections, ${errorCount} errors`);
      return errorCount === 0;
    } catch (error) { 
      console.error('[dataService] syncInspections exception:', error); 
      return false; 
    }
  },

  async fetchLocations() {
    try {
      const { data, error } = await supabase.from('fims_locations').select('*').order('name');
      if (error) { console.warn('[dataService] fetchLocations error:', error.message); return { success: false, locations: [] }; }
      const locations = (data || []).map(row => ({ ...row.data, id: row.data.id || row.id }));
      console.log(`[dataService] Fetched ${locations.length} locations`);
      return { success: true, locations };
    } catch (error) { console.error('[dataService] fetchLocations exception:', error); return { success: false, locations: [] }; }
  },

  async syncLocations(locations) {
    try {
      if (!locations || locations.length === 0) return true;
      const rows = locations.map(l => ({ id: String(l.id), data: l, name: l.name || null, updated_at: new Date().toISOString() }));
      const batchSize = 100;
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from('fims_locations').upsert(batch);
        if (error) { console.warn('[dataService] syncLocations error:', error.message); errorCount += batch.length; }
        else { successCount += batch.length; }
      }
      console.log(`[dataService] Synced ${successCount} locations, ${errorCount} errors`);
      return errorCount === 0;
    } catch (error) { console.error('[dataService] syncLocations exception:', error); return false; }
  },

  subscribeToInspectionChanges(onChange) {
    console.log('[dataService] Setting up inspections real-time...');
    
    const channelName = `fims-inspections-${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'fims_inspections' 
      }, (payload) => {
        console.log('[dataService] Inspections event:', payload.eventType);
        // Formatar o payload igual ao fetchInspections
        if (payload.new) {
          const dataContent = payload.new.data || {};
          payload.new = {
            ...dataContent,
            id: payload.new.id,
            inspector_id: payload.new.inspector_id || dataContent.inspector_id,
            inspector_name: payload.new.inspector_name || dataContent.inspector_name,
            status: payload.new.status || dataContent.status,
            date: payload.new.date || dataContent.date,
            location_name: payload.new.location_name || dataContent.location_name,
            alert_level: payload.new.alert_level || dataContent.alert_level,
            type: payload.new.type || dataContent.type,
            updated_at: payload.new.updated_at,
            created_at: payload.new.created_at
          };
        }
        if (payload.old) {
          const dataContent = payload.old.data || {};
          payload.old = {
            ...dataContent,
            id: payload.old.id,
            inspector_id: payload.old.inspector_id || dataContent.inspector_id
          };
        }
        onChange(payload);
      });
    
    channel.subscribe((status) => { 
      console.log('[dataService] Realtime status:', status); 
    });
    
    return () => { 
      console.log('[dataService] Unsubscribing'); 
      supabase.removeChannel(channel); 
    };
  },

  subscribeToLocationChanges(onChange) {
    console.log('[dataService] Setting up locations real-time...');
    const channelName = `fims-locations-${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fims_locations' }, (payload) => {
        console.log('[dataService] Locations event:', payload.eventType);
        onChange(payload);
      })
      .subscribe((status) => { console.log('[dataService] Locations realtime status:', status); });
    return () => { console.log('[dataService] Unsubscribing from locations'); supabase.removeChannel(channel); };
  }
};
