const { Room } = require('colyseus');

// 방 하나 = 게임 한 판(같은 roomCode를 입력한 사람들끼리, 최대 6명 = 호스트 1 + 게스트 5).
// 서버는 스키마 동기화 상태(state)를 쓰지 않고, 메시지 릴레이 + 방/참가자 목록 관리만 담당합니다.
// - 'input'   : 참가자 -> (서버가 중계) -> 호스트  (매 프레임 방향키/조준/공격 입력)
// - 'snapshot': 호스트 -> (서버가 중계) -> 나머지 참가자들 전체 (매 프레임 계산된 위치/HP/벽돌 등 게임 상태)
// - 'event'   : 라운드 시작/종료 등 저빈도 이벤트. 방향 상관없이 상대편으로 그대로 릴레이.
// - 'ready'   : 게스트가 "준비 완료" 상태를 토글 (호스트는 해당 없음)
// - 'kick'    : 호스트가 특정 게스트를 방에서 강제 퇴장시킴
const ROOM_MAX_CLIENTS = 6;

class GameRoom extends Room {
  onCreate(options) {
    this.maxClients = ROOM_MAX_CLIENTS;
    this.autoDispose = true;

    this.hostSessionId = null;
    this.playerMeta = new Map(); // sessionId -> { index, name, ready }

    // 방 목록 화면(게스트가 서버 주소만 입력하고 방 코드는 직접 안 치고 목록에서 골라 들어올 수
    // 있게 하기 위한 기능)에서 각 방을 구분해 보여줄 수 있도록 메타데이터를 심어둠. 호스트 이름은
    // 아직 아무도 안 들어온 시점이라 여기선 모르고, onJoin에서 호스트가 들어오는 순간 채워짐.
    this.setMetadata({ roomCode: (options && options.roomCode) || 'default', hostName: null });

    this.onMessage('input', (client, data) => {
      if (!this.hostSessionId) return;
      const host = this.clients.find(c => c.sessionId === this.hostSessionId);
      if (host && host.sessionId !== client.sessionId) {
        host.send('input', Object.assign({}, data, { sessionId: client.sessionId }));
      }
    });

    this.onMessage('snapshot', (client, data) => {
      // 스냅샷은 반드시 현재 호스트만 보낼 수 있음 (다른 클라이언트가 보내도 무시)
      if (client.sessionId !== this.hostSessionId) return;
      this.broadcast('snapshot', data, { except: client });
    });

    this.onMessage('event', (client, data) => {
      if (client.sessionId === this.hostSessionId) {
        this.broadcast('event', data, { except: client });
      } else {
        const host = this.clients.find(c => c.sessionId === this.hostSessionId);
        if (host) host.send('event', Object.assign({}, data, { sessionId: client.sessionId }));
      }
    });

    // 게스트가 대기실에서 "준비 완료" 상태를 켜고 끔. 호스트가 보내면 무시함(호스트는 준비 개념이 없음).
    this.onMessage('ready', (client, data) => {
      if (client.sessionId === this.hostSessionId) return;
      const meta = this.playerMeta.get(client.sessionId);
      if (!meta) return;
      meta.ready = !!(data && data.ready);
      console.log(`[ready] room=${this.roomId} session=${client.sessionId} ready=${meta.ready}`);
      this.broadcastRoomInfo();
    });

    // 호스트가 특정 게스트를 강퇴. 대상에게 'kicked'를 먼저 보내고, 잠깐 뒤 연결을 끊음
    // (메시지가 끊기기 전에 도착하도록 약간의 지연을 둠).
    this.onMessage('kick', (client, data) => {
      if (client.sessionId !== this.hostSessionId) return;
      const targetId = data && data.sessionId;
      if (!targetId || targetId === client.sessionId) return;
      const target = this.clients.find(c => c.sessionId === targetId);
      if (!target) return;
      console.log(`[kick] room=${this.roomId} host=${client.sessionId} target=${targetId}`);
      target.send('kicked', {});
      setTimeout(() => {
        try { target.leave(); } catch (e) { /* 이미 끊겼으면 무시 */ }
      }, 150);
    });
  }

  onJoin(client, options) {
    const index = this.playerMeta.size;
    const rawName = options && options.name ? String(options.name) : `플레이어${index + 1}`;
    const name = rawName.slice(0, 16);
    // rankTier: 클라이언트(index.html)가 접속 시 자기 기기에 저장된 등급(0~19)을 함께 보내줌.
    // 서버는 이 값의 의미를 모르고 그냥 그대로 보관/중계만 함 - 실제 등급 계산/표시는 클라이언트가 함.
    const rankTier = (options && typeof options.rankTier === 'number') ? options.rankTier : null;
    this.playerMeta.set(client.sessionId, { index, name, ready: false, rankTier });

    if (!this.hostSessionId) {
      this.hostSessionId = client.sessionId;
      // 방 목록에 "누구 방인지" 이름이 보이도록, 방을 만든(첫 입장한) 사람의 이름을 메타데이터에 채움
      this.setMetadata({ roomCode: (options && options.roomCode) || 'default', hostName: name });
    }

    console.log(`[join] room=${this.roomId} session=${client.sessionId} index=${index} host=${this.hostSessionId} (${this.playerMeta.size}/${ROOM_MAX_CLIENTS})`);

    // 방금 들어온 클라이언트는 아직 onMessage('room-info', ...) 리스너를 붙이기 전일 수 있어서(연결 응답을
    // 받은 뒤 리스너를 등록하기까지 아주 짧은 시간차가 있음), 곧바로 브로드캐스트하면 그 첫 메시지를
    // 놓칠 수 있습니다. 아주 짧게 지연시켜 리스너가 붙을 시간을 준 뒤 보냅니다.
    this.clock.setTimeout(() => this.broadcastRoomInfo(), 60);
  }

  onLeave(client) {
    this.playerMeta.delete(client.sessionId);

    if (client.sessionId === this.hostSessionId) {
      const next = this.clients.find(c => c.sessionId !== client.sessionId);
      this.hostSessionId = next ? next.sessionId : null;
      console.log(`[host-migration] room=${this.roomId} new host=${this.hostSessionId}`);
    }

    this.broadcast('peer-left', { sessionId: client.sessionId });
    this.broadcastRoomInfo();
  }

  broadcastRoomInfo() {
    const players = Array.from(this.playerMeta.entries()).map(([sessionId, meta]) => ({
      sessionId,
      index: meta.index,
      name: meta.name,
      ready: !!meta.ready,
      isHost: sessionId === this.hostSessionId,
      rankTier: meta.rankTier
    }));
    this.broadcast('room-info', { hostSessionId: this.hostSessionId, players, maxClients: ROOM_MAX_CLIENTS });
  }
}

module.exports = { GameRoom };
