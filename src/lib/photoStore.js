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
          // Converter o nome do ficheiro para .jpg já que vamos comprimir em JPEG
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
      // 1. Comprimir a imagem para evitar travamentos no upload
      const compressedFile = await compressImage(file);
      
      // 2. Criar um nome único para o ficheiro
      const fileExt = compressedFile.name.split('.').pop();
      const fileName = `${inspectionId}/${entityId}/${Date.now()}.${fileExt}`;
      
      // 3. Fazer o upload para o Supabase Storage
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

      // 4. Obter o link público da imagem
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      if (!urlData || !urlData.publicUrl) {
        throw new Error("Não foi possível obter a URL pública da foto.");
      }

      return {
        id: fileName,
        url: urlData.publicUrl,
        filename: file.name, // Manter o nome original do ficheiro para o utilizador
        inspection_id: inspectionId,
        entity_id: entityId
      };
    } catch (error) {
      console.error('[photoStore] Erro ao fazer upload:', error);
      throw error; // Passa o erro para o componente tratar
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
