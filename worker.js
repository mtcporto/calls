// Código para o Cloudflare Worker (signaling.js)
// Versão com Cloudflare KV para armazenamento persistente

// Binding do KV namespace - corresponde ao definido no wrangler.toml
// [[kv_namespaces]]
// binding = "WEBRTC_ROOMS"
// id = "1ece5577aff346cc8cb777e579ffeaf3"

// Utilidades para estruturas de dados
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Helpers para lidar com KV
async function getRoomData(roomId) {
  try {
    const roomData = await WEBRTC_ROOMS.get(`room:${roomId}`, { type: "json" });
    return roomData || { users: {}, signals: [] };
  } catch (error) {
    console.error(`Erro ao recuperar sala ${roomId}:`, error);
    return { users: {}, signals: [] };
  }
}

async function saveRoomData(roomId, data) {
  try {
    await WEBRTC_ROOMS.put(`room:${roomId}`, JSON.stringify(data), {
      expirationTtl: 86400 // 24 horas
    });
  } catch (error) {
    console.error(`Erro ao salvar sala ${roomId}:`, error);
  }
}

async function cleanupRooms() {
  // Implementação opcional para remover salas antigas
  // Este é um exemplo simplificado, em produção você precisaria
  // listar todas as chaves e verificar cada sala
}

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
    try {
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
      
      // Obter dados da sala do KV
      const roomData = await getRoomData(room);
      
      // Registrar usuário na sala
      const now = Date.now();
      roomData.users[id] = { 
        id, 
        name: name || 'Anônimo', 
        timestamp: now
      };
      
      // Remover usuários inativos (mais de 5 minutos)
      Object.keys(roomData.users).forEach(userId => {
        if (now - roomData.users[userId].timestamp > 300000) {
          console.log(`Removendo usuário inativo ${userId} da sala ${room}`);
          delete roomData.users[userId];
        }
      });
      
      // Salvar alterações de volta no KV
      await saveRoomData(room, roomData);
      
      return new Response(JSON.stringify({
        success: true,
        users: Object.values(roomData.users)
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /join:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro interno do servidor'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  if (url.pathname === '/signal') {
    try {
      const data = await request.json();
      const { sender, target, type, data: signalData, room } = data;
      
      if (!sender || !target || !type || !room) {
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
      
      // Obter dados da sala
      const roomData = await getRoomData(room);
      
      // Verificar se os usuários existem
      if (!roomData.users[sender]) {
        console.log(`Adicionando usuário ${sender} que estava ausente`);
        roomData.users[sender] = {
          id: sender,
          name: data.name || "Reconectado",
          timestamp: Date.now()
        };
      } else {
        // Atualizar timestamp do remetente
        roomData.users[sender].timestamp = Date.now();
      }
      
      console.log(`Sinal ${type} de ${sender} para ${target} na sala ${room}`);
      
      // Adicionar ID único para evitar duplicatas
      const signalId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      
      // Adicionar sinal à sala
      if (!roomData.signals) {
        roomData.signals = [];
      }
      
      roomData.signals.push({
        id: signalId,
        sender,
        target,
        type,
        data: signalData,
        name: roomData.users[sender]?.name,
        timestamp: Date.now()
      });
      
      // Limitar número de sinais armazenados
      if (roomData.signals.length > 200) {
        roomData.signals = roomData.signals.slice(-200);
      }
      
      // Salvar alterações
      await saveRoomData(room, roomData);
      
      return new Response(JSON.stringify({ 
        success: true,
        signalId
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /signal:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro interno do servidor'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  // Melhorias no endpoint /poll
  if (url.pathname === '/poll') {
    try {
      const roomId = url.searchParams.get('room');
      const userId = url.searchParams.get('id');
      const lastTimestamp = parseInt(url.searchParams.get('last') || '0');
      
      if (!roomId || !userId) {
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
      
      // Obter dados da sala
      const roomData = await getRoomData(roomId);
      
      // Marcar como ativo
      if (roomData.users[userId]) {
        roomData.users[userId].timestamp = Date.now();
      } else {
        // Adicionar usuário à sala se não existir
        roomData.users[userId] = { 
          id: userId, 
          name: 'Reconectado', 
          timestamp: Date.now() 
        };
      }
      
      // Filtrar sinais vencidos (mais de 2 minutos)
      const now = Date.now();
      if (roomData.signals) {
        roomData.signals = roomData.signals.filter(
          signal => now - signal.timestamp < 120000
        );
      } else {
        roomData.signals = [];
      }
      
      // Buscar sinais pendentes para este usuário
      const pendingSignals = roomData.signals.filter(
        signal => signal.target === userId && signal.timestamp > lastTimestamp
      );
      
      // Remover usuários inativos (mais de 2 minutos)
      const usersToRemove = [];
      for (const otherUserId in roomData.users) {
        if (now - roomData.users[otherUserId].timestamp > 120000) {
          console.log(`Removendo usuário inativo ${otherUserId} da sala ${roomId}`);
          usersToRemove.push(otherUserId);
        }
      }
      
      usersToRemove.forEach(id => delete roomData.users[id]);
      
      // Salvar alterações
      await saveRoomData(roomId, roomData);
      
      console.log(`Poll de ${userId}: sala=${roomId}, ${pendingSignals.length} sinais, ${Object.keys(roomData.users).length} usuários`);
      
      return new Response(JSON.stringify({
        success: true,
        signals: pendingSignals,
        users: Object.values(roomData.users)
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /poll:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro interno do servidor'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  // Adicionar endpoint para verificação de status
  if (url.pathname === '/status') {
    try {
      // Lista todas as keys que começam com "room:"
      const keys = await WEBRTC_ROOMS.list({ prefix: "room:" });
      const roomIds = keys.keys.map(key => key.name.replace("room:", ""));
      
      // Obter estatísticas básicas
      let totalUsers = 0;
      let totalSignals = 0;
      let roomsData = {};
      
      for (const roomId of roomIds) {
        const roomData = await getRoomData(roomId);
        const userCount = Object.keys(roomData.users || {}).length;
        const signalCount = (roomData.signals || []).length;
        
        totalUsers += userCount;
        totalSignals += signalCount;
        
        roomsData[roomId] = {
          users: userCount,
          signals: signalCount
        };
      }
      
      return new Response(JSON.stringify({
        success: true,
        status: "online",
        stats: {
          rooms: roomIds.length,
          totalUsers,
          totalSignals,
          roomsData
        },
        timestamp: new Date().toISOString()
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /status:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro ao buscar status'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  return new Response('Not Found', { 
    status: 404, 
    headers 
  });
}