// Use local API server with proxy in development to bypass CORS
const API_BASE_URL = import.meta.env.DEV 
  ? "/api/local" 
  : "http://127.0.0.1:8000";

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value
        .map((item) => (item ?? "").toString().trim())
        .filter(Boolean)
        .forEach((item) => searchParams.append(key, item));
      return;
    }

    const text = value.toString().trim();
    if (!text) return;
    searchParams.append(key, text);
  });

  return searchParams.toString();
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      mode: 'cors', // Enable CORS
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `Request failed: ${response.status}` };
      }
      throw new Error(errorData?.error || `Request failed: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error(`Không thể kết nối đến API. Vui lòng kiểm tra kết nối mạng hoặc URL API: ${url}`);
    }
    throw err;
  }
}

export async function getDetailReports(params = {}) {
  const query = buildQuery(params);
  const url = `${API_BASE_URL}/detail_reports${query ? `?${query}` : ""}`;
  return requestJson(url);
}

export async function getDetailReportsStatisticsByQuery(params = {}) {
  // Build query string - ensure team and ngay are always included (empty string if not provided)
  const queryParams = new URLSearchParams();
  
  // Always include team (empty string if not provided)
  queryParams.append('team', params.team || '');
  
  // Always include ngay (empty string if not provided)
  queryParams.append('ngay', params.ngay || '');
  
  // Add other params if provided
  Object.entries(params).forEach(([key, value]) => {
    if (key !== 'team' && key !== 'ngay') {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item) queryParams.append(key, item.toString().trim());
          });
        } else {
          const text = value.toString().trim();
          if (text) queryParams.append(key, text);
        }
      }
    }
  });
  
  const query = queryParams.toString();
  const url = `${API_BASE_URL}/detail_reports/statistics?${query}`;
  console.log('🔗 API URL:', url);
  console.log('📋 Params:', params);
  return requestJson(url);
}

export async function getDetailReportsStatisticsByBody(payload = {}) {
  const url = `${API_BASE_URL}/detail_reports/statistics`;
  return requestJson(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
