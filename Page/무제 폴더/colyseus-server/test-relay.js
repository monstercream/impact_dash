// 서버가 host-relay 로직대로 동작하는지 확인하는 임시 테스트 스크립트 (배포에는 불필요, 확인 후 삭제 가능)
const { Client } = require('colyseus.js');

async function main() {
  const client = new Client('ws://localhost:2567');

  const roomA = await client.joinOrCreate('game', { roomCode: 'TEST1', name: 'A' });
  const roomB = await client.joinOrCreate('game', { roomCode: 'TEST1', name: 'B' });

  let aInfo, bInfo;
  roomA.onMessage('room-info', (msg) => { aInfo = msg; });
  roomB.onMessage('room-info', (msg) => { bInfo = msg; });

  let bReceivedInput = null;
  roomB.onMessage('input', (msg) => { bReceivedInput = msg; });

  let aReceivedSnapshot = null;
  roomA.onMessage('snapshot', (msg) => { aReceivedSnapshot = msg; });

  await new Promise(r => setTimeout(r, 500));

  console.log('roomA.sessionId (host 예상):', roomA.sessionId);
  console.log('roomB.sessionId (peer 예상):', roomB.sessionId);
  console.log('A가 본 room-info:', JSON.stringify(aInfo));
  console.log('B가 본 room-info:', JSON.stringify(bInfo));

  const isHostCorrect = aInfo && aInfo.hostSessionId === roomA.sessionId;
  console.log('호스트가 먼저 들어온 A로 지정됨:', isHostCorrect);

  // B(비호스트)가 input을 보내면 서버가 A(호스트)에게만 중계해야 함
  roomB.send('input', { ax: 1, ay: 0, angle: 0, wantCharge: false, wantRelease: false });
  await new Promise(r => setTimeout(r, 300));
  console.log('A가 받은 input 메시지:', JSON.stringify(bReceivedInput === null ? null : 'roomA는 input을 못 받아야 정상(호스트만 받음)'));

  // A(호스트)가 snapshot을 보내면 B가 받아야 함
  let aReceivedInputOnA = null;
  roomA.onMessage('input', (msg) => { aReceivedInputOnA = msg; });
  roomB.send('input', { ax: 1, ay: 0, angle: 0 });
  await new Promise(r => setTimeout(r, 300));
  console.log('호스트(A)가 받은 input:', JSON.stringify(aReceivedInputOnA));

  roomA.send('snapshot', { chars: [{ id: 0, x: 100, y: 200 }] });
  await new Promise(r => setTimeout(r, 300));
  console.log('비호스트(B)가 받은 snapshot:', JSON.stringify(aReceivedSnapshot === null ? '(A 자신은 못 받음, 정상)' : aReceivedSnapshot));

  let bReceivedSnapshot = null;
  roomB.onMessage('snapshot', (msg) => { bReceivedSnapshot = msg; });
  roomA.send('snapshot', { chars: [{ id: 0, x: 111, y: 222 }] });
  await new Promise(r => setTimeout(r, 300));
  console.log('B가 받은 snapshot:', JSON.stringify(bReceivedSnapshot));

  await roomA.leave();
  await roomB.leave();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
