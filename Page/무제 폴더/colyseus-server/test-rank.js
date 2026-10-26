// 등급(rankTier) 정보가 접속 옵션 -> playerMeta -> room-info 브로드캐스트까지 잘 전달되는지 검증
const { Client } = require('colyseus.js');

async function main() {
  const client = new Client('ws://localhost:2567');

  const host = await client.create('game', { roomCode: 'RANKTEST', name: 'Host', rankTier: 7 });
  const guest = await client.join('game', { roomCode: 'RANKTEST', name: 'Guest', rankTier: 15 });

  let hostInfo;
  host.onMessage('room-info', (m) => { hostInfo = m; });

  await new Promise(r => setTimeout(r, 400));

  const hostEntry = hostInfo.players.find(p => p.sessionId === host.sessionId);
  const guestEntry = hostInfo.players.find(p => p.sessionId === guest.sessionId);
  console.log('host rankTier 전달됨:', hostEntry.rankTier === 7);
  console.log('guest rankTier 전달됨:', guestEntry.rankTier === 15);

  // rankTier를 안 보낸 경우(구버전 클라이언트 등) null로 안전하게 처리되는지
  const guest2 = await client.join('game', { roomCode: 'RANKTEST', name: 'NoRank' });
  await new Promise(r => setTimeout(r, 300));
  const noRankEntry = hostInfo.players.find(p => p.sessionId === guest2.sessionId);
  console.log('rankTier 없이 접속해도 안 터짐(null):', noRankEntry.rankTier === null || noRankEntry.rankTier === undefined);

  await host.leave();
  await guest.leave();
  await guest2.leave();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
