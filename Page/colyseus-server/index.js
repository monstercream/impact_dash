// Impact Dash 2.0 - Colyseus 실시간 멀티플레이 서버
// "호스트 릴레이" 방식: 이 서버는 게임 물리/판정 로직을 전혀 갖고 있지 않습니다.
// 방에 가장 먼저 들어온 클라이언트가 "호스트"가 되어 기존 index.html의 게임 로직을 그대로 돌리고,
// 매 프레임 계산한 결과(스냅샷)를 이 서버가 다른 참가자들에게 그대로 전달(릴레이)만 해줍니다.
// 반대로 참가자들의 입력(방향키/조준/공격)은 이 서버를 거쳐 호스트에게만 전달됩니다.
//
// 실행 방법:
//   cd colyseus-server
//   npm install
//   npm start
// 기본적으로 ws://localhost:2567 에서 대기합니다.

const http = require('http');
const express = require('express');
const { Server } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const { GameRoom } = require('./rooms/GameRoom');

const port = Number(process.env.PORT || 2567);
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Impact Dash 2.0 Colyseus 서버가 정상적으로 실행 중입니다.');
});

const httpServer = http.createServer(app);

// ping/pong 여유 시간을 기본값보다 넉넉하게 잡음: 호스트 브라우저는 물리/AI/렌더링/스냅샷 직렬화를
// 전부 혼자 처리하기 때문에, 프레임이 잠깐 무거워지거나(GC 등) 탭이 살짝 버벅이면 기본값(약 3초)
// 안에 응답을 못 보내서 "게임을 조금 하다 보면 서버에서 튕긴다"는 문제가 생길 수 있음.
// pingInterval * (pingMaxRetries+1) 만큼 여유를 주면 이런 오탐 끊김을 크게 줄일 수 있음(약 15초).
//
// maxPayload: @colyseus/ws-transport의 기본값은 겨우 4KB(4*1024)입니다. 이 게임의 'snapshot'
// 메시지는 캐릭터(최대 6명)+벽돌+아이템+폭탄+코인 정보를 통째로 담아서 보내기 때문에 게임이
// 시작되고 조금만 지나도 쉽게 4KB를 넘겨서, 서버가 "Max payload size exceeded" 에러를 내며
// 그 연결을 강제로 끊어버리는 문제가 있었습니다. 넉넉하게 1MB로 올려서 이 문제를 없앴습니다.
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    pingInterval: 3000,
    pingMaxRetries: 5,
    maxPayload: 1024 * 1024
  })
});

// "roomCode" 옵션이 같은 클라이언트끼리만 같은 방에 매칭되도록 filterBy를 사용합니다.
// (같은 방 코드를 입력한 사람들끼리만 같은 게임에 들어가게 하기 위함)
gameServer.define('game', GameRoom).filterBy(['roomCode']);

gameServer.listen(port).then(() => {
  console.log(`[Impact Dash] Colyseus 서버 실행 중: ws://localhost:${port}`);
});
