interface FetchOptions extends RequestInit {
  data?: any;
}

export async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  const { data, headers: customHeaders, ...customConfig } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  const config: RequestInit = {
    method: data ? 'POST' : 'GET',
    body: data ? JSON.stringify(data) : undefined,
    headers,
    credentials: 'include',
    ...customConfig,
  };

  const response = await fetch(`/api${endpoint}`, config);
  
  let responseData;
  let rawText = '';
  try {
    rawText = await response.text();
    responseData = rawText ? JSON.parse(rawText) : null;
  } catch {
    responseData = null;
  }

  if (!response.ok) {
    // If backend returns a specific error message, we throw it
    const errorMessage = responseData?.error || responseData?.message || `Erro inesperado (Status ${response.status}). Resposta: ${rawText.substring(0, 80)}`;
    const err = new Error(errorMessage);
    (err as any).data = responseData;
    throw err;
  }

  return responseData;
}
