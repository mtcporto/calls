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
    
    if (!room || !id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Parâmetros inválidos' 
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    
    // Inicializar sala se não existir
    if (!rooms[room]) rooms[room] = {};
    if (!signals[room]) signals[room] = [];
    
    // Registrar usuário na sala
    rooms[room][id] = { 
      id, 
      name: name || 'Anônimo', 
      timestamp: Date.now() 
    };
    
    console.log(`Usuário ${id} entrou na sala ${room}`);
    
    // Remover usuários inativos (mais de 5 minutos)
    const now = Date.now();
    for (const userId in rooms[room]) {
      if (now - rooms[room][userId].timestamp > 300000) {
        console.log(`Removendo usuário inativo ${userId} da sala ${room}`);
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
    
    if (!sender || !target || !type) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Parâmetros inválidos' 
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    
    // Encontrar a sala certa
    let roomName = null;
    for (const room in rooms) {
      if (rooms[room][sender] && rooms[room][target]) {
        roomName = room;
        break;
      }
    }
    
    if (!roomName) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Sala não encontrada' 
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 404
      });
    }
    
    console.log(`Sinal ${type} de ${sender} para ${target} na sala ${roomName}`);
    
    // Armazenar o sinal para ser recuperado depois
    if (!signals[roomName]) signals[roomName] = [];
    
    // Adicionar ID único para evitar duplicatas
    const signalId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    signals[roomName].push({
      id: signalId,
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
    
    return new Response(JSON.stringify({ 
      success: true,
      signalId
    }), {
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
    
    if (!roomName || !userId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Parâmetros inválidos' 
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    
    // Verificar se a sala existe
    if (!rooms[roomName]) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Sala não encontrada' 
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 404
      });
    }
    
    // Marcar como ativo
    if (rooms[roomName][userId]) {
      rooms[roomName][userId].timestamp = Date.now();
    } else {
      // Se o usuário não está na sala, mas está tentando fazer polling
      // podemos adicioná-lo à sala como potencial reconexão
      console.log(`Usuário ${userId} reconectado à sala ${roomName}`);
      rooms[roomName][userId] = { 
        id: userId, 
        name: 'Reconectado', 
        timestamp: Date.now() 
      };
    }
    
    // Filtrar sinais vencidos (mais de 2 minutos)
    const now = Date.now();
    if (signals[roomName]) {
      signals[roomName] = signals[roomName].filter(
        signal => now - signal.timestamp < 120000
      );
    }
    
    // Buscar sinais pendentes para este usuário
    const pendingSignals = [];
    if (signals[roomName]) {
      signals[roomName].forEach(signal => {
        if (signal.target === userId && signal.timestamp > lastTimestamp) {
          pendingSignals.push(signal);
        }
      });
    }
    
    // Remover usuários inativos (mais de 2 minutos)
    for (const otherUserId in rooms[roomName]) {
      if (now - rooms[roomName][otherUserId].timestamp > 120000) {
        console.log(`Removendo usuário inativo ${otherUserId} da sala ${roomName}`);
        delete rooms[roomName][otherUserId];
      }
    }
    
    console.log(`Poll de ${userId}: sala=${roomName}, ${pendingSignals.length} sinais, ${Object.keys(rooms[roomName]).length} usuários`);
    
    return new Response(JSON.stringify({
      success: true,
      signals: pendingSignals,
      users: Object.values(rooms[roomName])
    }), {
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
  
  // Adicionar endpoint para verificação de status
  if (url.pathname === '/status') {
    const stats = {
      rooms: Object.keys(rooms).length,
      totalUsers: 0,
      totalSignals: 0
    };
    
    for (const room in rooms) {
      stats.totalUsers += Object.keys(rooms[room]).length;
    }
    
    for (const room in signals) {
      stats.totalSignals += signals[room].length;
    }
    
    return new Response(JSON.stringify({
      success: true,
      status: "online",
      stats,
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
  
  return new Response('Not Found', { 
    status: 404, 
    headers 
  });
}