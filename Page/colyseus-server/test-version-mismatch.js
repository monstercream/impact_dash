// colyseus.js(클라이언트) 0.16.x 로 colyseus(서버) 0.15.x 방에 접속해서, 실제 게임처럼
// 'ready' -> 'event' -> 'input'을 빠르게 여러 번 보내봤을 때 서버가
// "Unexpected end of MessagePack data" 로 죽는지 재현하는 스크립트.
const { Client } = require('colyseus.js'); // devDependency로 설치된 0.16.x 버전을 씀 (버전 불일치 재현용)

async function main() {
  const client = new Client('ws://localhost:2567');
  const host = await client.create('game', { roomCode: 'MISMATCH', name: 'Host' });
  const guest = await client.join('game', { roomCode: 'MISMATCH', name: 'Guest' });

  let serverErrored = false;
  host.onError((code, message) => { console.log('host onError', code, message); });
  guest.onError((code, message) => { console.log('guest onError', code, message); });
  host.onLeave((code) => { console.log('host onLeave code=', code); serverErrored = true; });
  guest.onLeave((code) => { console.log('guest onLeave code=', code); });

  guest.send('ready', { ready: true });
  await new Promise(r => setTimeout(r, 200));
  host.send('event', { type: 'roundStart' });
  await new Promise(r => setTimeout(r, 200));

  // 실제 updateOnlineClient()가 보내는 것과 같은 모양의 'input'을 30Hz로 60번(약 2초) 전송
  for (let i = 0; i < 60; i++) {
    guest.send('input', { ax: Math.sin(i*0.1), ay: Math.cos(i*0.1), angle: Math.random()*6.28, wantCharge: i%3===0, wantRelease: i%7===0 });
    await new Promise(r => setTimeout(r, 33));
  }

  await new Promise(r => setTimeout(r, 500));
  console.log('서버가 도중에 끊겼는가(=버그 재현됨):', serverErrored);
  process.exit(0);
}

main().catch(e => { console.error('스크립트 자체 에러:', e); process.exit(1); });
