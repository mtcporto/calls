// Código para o Cloudflare Worker (signaling.js)
const rooms = {};
const signals = {};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Adicione headers para CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  // Handle preflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  if (url.pathname === '/join') {
    const data = await request.json();
    const { room, id, name } = data;
    
    if (!rooms[room]) rooms[room] = {};
    if (!signals[room]) signals[room] = [];
    
    rooms[room][id] = { id, name, timestamp: Date.now() };
    
    // Remover usuários inativos (mais de 5 minutos)
    const now = Date.now();
    for (const userId in rooms[room]) {
      if (now - rooms[room][userId].timestamp > 300000) {
        delete rooms[room][userId];
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      users: Object.values(rooms[room])
    }), {
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
  
  if (url.pathname === '/signal') {
    const data = await request.json();
    const { sender, target, type, data: signalData } = data;
    
    // Encontrar a sala certa
    let roomName = null;
    for (const room in rooms) {
      if (rooms[room][sender] && rooms[room][target]) {
        roomName = room;
        break;
      }
    }
    
    if (roomName) {
      // Armazenar o sinal para ser recuperado depois
      if (!signals[roomName]) signals[roomName] = [];
      
      signals[roomName].push({
        sender,
        target,
        type,
        data: signalData,
        timestamp: Date.now()
      });
      
      // Limitar número de sinais armazenados
      if (signals[roomName].length > 100) {
        signals[roomName] = signals[roomName].slice(-100);
      }
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
  
  // Melhorias no endpoint /poll
  if (url.pathname === '/poll') {
    const roomName = url.searchParams.get('room');
    const userId = url.searchParams.get('id');
    const lastTimestamp = parseInt(url.searchParams.get('last') || '0');
    
    // Marcar como ativo
    if (rooms[roomName] && rooms[roomName][userId]) {
      rooms[roomName][userId].timestamp = Date.now();
    }
    
    // Buscar sinais pendentes para este usuário com TTL maior (2 minutos)
    const pendingSignals = [];
    if (signals[roomName]) {
      const now = Date.now();
      signals[roomName] = signals[roomName].filter(signal => now - signal.timestamp < 120000); // 2 minutos TTL
      
      signals[roomName].forEach(signal => {
        if (signal.target === userId && signal.timestamp > lastTimestamp) {
          pendingSignals.push(signal);
        }
      });
    }
    
    // Debug: mostrar contagem de sinais e usuários
    console.log(`Poll: sala=${roomName}, usuário=${userId}, sinais=${pendingSignals.length}, usuários=${rooms[roomName] ? Object.keys(rooms[roomName]).length : 0}`);
    
    return new Response(JSON.stringify({
      success: true,
      signals: pendingSignals,
      users: rooms[roomName] ? Object.values(rooms[roomName]) : []
    }), {
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
  
  return new Response('Not Found', { status: 404, headers });
}