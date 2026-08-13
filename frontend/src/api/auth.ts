import { apiClient } from './client';

export interface LoginResponse {
  accessToken: string;
  user: { id: string; username: string; displayName?: string };
}

export async function login(username: string, password: string) {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', {
    username,
    password,
  });
  return data;
}
