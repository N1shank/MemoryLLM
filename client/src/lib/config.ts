export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  maxUploadSize: 10 * 1024 * 1024, // 10MB
};
