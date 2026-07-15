// 로비 기능(호스트 지정, ready, kick, 6인 제한) 검증용 임시 스크립트
const { Client } = require('colyseus.js');

async function main() {
  const client = new Client('ws://localhost:2567');

  const host = await client.create('game', { roomCode: 'LOBBYTEST', name: 'Host' });
  const guest = await client.join('game', { roomCode: 'LOBBYTEST', name: 'Guest' });

  let hostInfo, guestInfo;
  host.onMessage('room-info', (m) => { hostInfo = m; });
  guest.onMessage('room-info', (m) => { guestInfo = m; });
  let guestKicked = false;
  guest.onMessage('kicked', () => { guestKicked = true; });

  await new Promise(r => setTimeout(r, 400));
  console.log('host is host:', hostInfo.hostSessionId === host.sessionId);
  console.log('guest ready initially false:', guestInfo.players.find(p=>p.sessionId===guest.sessionId).ready === false);
  console.log('maxClients:', guestInfo.maxClients);

  guest.send('ready', { ready: true });
  await new Promise(r => setTimeout(r, 300));
  console.log('guest ready now true:', hostInfo.players.find(p=>p.sessionId===guest.sessionId).ready === true);

  // 호스트가 아닌 사람이 kick을 보내면 무시되어야 함
  guest.send('kick', { sessionId: host.sessionId });
  await new Promise(r => setTimeout(r, 300));
  console.log('guest의 kick 시도는 무시됨 (host 세션이 아직 살아있어야 함):', hostInfo.players.some(p=>p.sessionId===host.sessionId));

  // 호스트가 게스트를 강퇴
  host.send('kick', { sessionId: guest.sessionId });
  await new Promise(r => setTimeout(r, 500));
  console.log('게스트가 kicked 메시지를 받음:', guestKicked);

  // 정원 테스트: 5명 더 접속시켜 6명(호스트+5) 채운 뒤 7번째는 실패해야 함
  const extra = [];
  for (let i=0;i<5;i++){
    const c = await client.join('game', { roomCode: 'LOBBYTEST', name: 'G'+i });
    extra.push(c);
  }
  await new Promise(r => setTimeout(r, 300));
  let overflowFailed = false;
  try {
    await client.join('game', { roomCode: 'LOBBYTEST', name: 'Overflow' });
  } catch (e) {
    overflowFailed = true;
  }
  console.log('7번째 접속(정원 초과)은 실패해야 함:', overflowFailed);

  await host.leave();
  for (const c of extra) await c.leave();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
