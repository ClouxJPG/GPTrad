export const config = { runtime: 'edge' };

export default async function handler(req) {
  const GIF_URL = 'https://meteoinfo.ru/hmc-output/rmap/phenomena.gif';
  
  try {
    const response = await fetch(GIF_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RocketRadar/1.0)',
      },
    });
    
    if (!response.ok) {
      return new Response(`Upstream error: ${response.status}`, { status: 502 });
    }
    
    const buffer = await response.arrayBuffer();
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(`Proxy error: ${e.message}`, { status: 500 });
  }
}
