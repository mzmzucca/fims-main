// src/lib/photoStore.js
import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'inspection-photos';

// Função auxiliar para comprimir a imagem antes do upload (Evita timeout)
async function compressImage(file, maxWidth = 1280, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          resolve(new File([blob], newName, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export const photoStore = {
  async add(inspectionId, entityId, file) {
    try {
      const compressedFile = await compressImage(file);
      const fileExt = compressedFile.name.split('.').pop();
      const fileName = `${inspectionId}/${entityId}/${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('[photoStore] Erro do Supabase no upload:', error.message);
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      if (!urlData || !urlData.publicUrl) {
        throw new Error("Não foi possível obter a URL pública da foto.");
      }

      return {
        id: fileName,
        url: urlData.publicUrl,
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
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(inspectionId, { recursive: true, limit: 1000 });

      if (error || !data) return {};

      const grouped = {};
      
      data.forEach(file => {
        // Ignorar pastas vazias
        if (!file.name || !file.name.includes('.')) return; 
        
        // O 'id' no objeto do Supabase costuma trazer o caminho completo: inspectionId/entityId/file.jpg
        const fullPath = file.id || `${inspectionId}/${file.name}`;
        const pathParts = fullPath.split('/');
        
        // Precisamos de pelo menos 3 partes: inspectionId/entityId/filename.jpg
        if (pathParts.length < 3) return;
        
        const entityId = pathParts[1]; // Extrair o entityId corretamente
        
        if (!grouped[entityId]) grouped[entityId] = [];
        
        const { data: urlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(fullPath);

        grouped[entityId].push({
          id: fullPath,
          url: urlData.publicUrl,
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
