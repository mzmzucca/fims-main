// src/lib/photoStore.js
import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'inspection-photos';

export const photoStore = {
  async add(inspectionId, entityId, file) {
    try {
      // Criar um nome único para o ficheiro
      const fileExt = file.name.split('.').pop();
      const fileName = `${inspectionId}/${entityId}/${Date.now()}.${fileExt}`;
      
      // Fazer o upload para o Supabase Storage
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file);

      if (error) throw error;

      // Obter o link público da imagem
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      return {
        id: fileName,
        url: publicUrl,
        filename: file.name,
        inspection_id: inspectionId,
        entity_id: entityId
      };
    } catch (error) {
      console.error('[photoStore] Erro ao fazer upload:', error);
      throw error;
    }
  },

  async remove(photoId) {
    try {
      // photoId neste caso é o caminho do ficheiro no Supabase
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([photoId]);
      if (error) throw error;
    } catch (error) {
      console.error('[photoStore] Erro ao remover:', error);
    }
  },

  async listByInspection(inspectionId) {
    try {
      // Listar todos os ficheiros dentro da pasta da inspeção
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(inspectionId, { recursive: true });

      if (error || !data) return {};

      const grouped = {};
      
      data.forEach(file => {
        // Ignorar pastas vazias
        if (!file.name.includes('.')) return; 
        
        // O caminho completo é inspectionId/nomeDoFicheiro
        const fullPath = `${inspectionId}/${file.name}`;
        const entityId = file.name.split('/')[0]; // Extrair o entityId do nome do ficheiro
        
        if (!grouped[entityId]) grouped[entityId] = [];
        
        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(fullPath);

        grouped[entityId].push({
          id: fullPath,
          url: publicUrl,
          filename: file.name
        });
      });

      return grouped;
    } catch (error) {
      console.error('[photoStore] Erro ao listar fotos:', error);
      return {};
    }
  }
};
