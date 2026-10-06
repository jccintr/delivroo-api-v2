import { vi } from 'vitest';

// Cloudinary falso: nenhum teste faz chamada de rede.
export default {
  config: () => ({ cloud_name: 'demo' }),
  uploader: {
    upload_stream: vi.fn((options, callback) => ({
      end: () => callback(null, {
        secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${options.folder}/${options.public_id}.jpg`,
        public_id: `${options.folder}/${options.public_id}`,
      }),
    })),
    destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
  },
};
