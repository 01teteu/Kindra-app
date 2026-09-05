export const setToken = (token: string) => {
  localStorage.setItem('kindra_auth_token', token);
};

export const getToken = () => {
  return localStorage.getItem('kindra_auth_token');
};

export const clearToken = () => {
  localStorage.removeItem('kindra_auth_token');
};
