/*
 * Connexion directe entre 2 téléphones, sans Internet ni serveur :
 * WebRTC en réseau local (même Wi-Fi ou partage de connexion), avec
 * échange de l'offre/réponse par QR codes.
 */
(function (root) {
  'use strict';

  var MAGIC_OFFER = 'SCRO1:';
  var MAGIC_ANSWER = 'SCRA1:';

  /* ---------- Compression + base64url (pour tenir dans un QR) ---------- */

  function bytesToB64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlToBytes(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function supportsCompression() {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  }

  async function pipe(bytes, stream) {
    var writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    var reader = stream.readable.getReader();
    var chunks = [];
    var total = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
      total += r.value.length;
    }
    var out = new Uint8Array(total);
    var off = 0;
    chunks.forEach(function (c) { out.set(c, off); off += c.length; });
    return out;
  }

  async function encodePayload(str) {
    var raw = new TextEncoder().encode(str);
    if (supportsCompression()) {
      var comp = await pipe(raw, new CompressionStream('deflate-raw'));
      return 'C' + bytesToB64url(comp);
    }
    return 'P' + bytesToB64url(raw);
  }

  async function decodePayload(payload) {
    var kind = payload.charAt(0);
    var bytes = b64urlToBytes(payload.slice(1));
    if (kind === 'C') {
      if (!supportsCompression()) throw new Error('Navigateur trop ancien (décompression indisponible).');
      var out = await pipe(bytes, new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(out);
    }
    return new TextDecoder().decode(bytes);
  }

  /* ---------- WebRTC ---------- */

  function waitIceComplete(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve();
      }
      pc.addEventListener('icegatheringstatechange', function () {
        if (pc.iceGatheringState === 'complete') finish();
      });
      // Filet de sécurité : en local, les candidats arrivent vite.
      setTimeout(finish, 4000);
    });
  }

  function Net() {
    this.pc = null;
    this.dc = null;
    this.onMessage = null;   // (objet)
    this.onOpen = null;
    this.onClose = null;
    this.role = null;        // 'host' | 'guest'
  }

  Net.prototype._newPc = function () {
    this.close();
    // Pas de serveur STUN/TURN : uniquement le réseau local (hors ligne).
    this.pc = new RTCPeerConnection({ iceServers: [] });
    var self = this;
    this.pc.addEventListener('connectionstatechange', function () {
      var st = self.pc && self.pc.connectionState;
      if ((st === 'failed' || st === 'disconnected' || st === 'closed') && self.onClose) {
        self.onClose();
      }
    });
  };

  Net.prototype._bindChannel = function (dc) {
    var self = this;
    this.dc = dc;
    dc.addEventListener('open', function () {
      if (self.onOpen) self.onOpen();
    });
    dc.addEventListener('close', function () {
      if (self.onClose) self.onClose();
    });
    dc.addEventListener('message', function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (self.onMessage) self.onMessage(msg);
    });
  };

  /* Hôte : crée l'offre, à afficher en QR. */
  Net.prototype.createOffer = async function () {
    this.role = 'host';
    this._newPc();
    this._bindChannel(this.pc.createDataChannel('scrabble', { ordered: true }));
    var offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitIceComplete(this.pc);
    var payload = await encodePayload(this.pc.localDescription.sdp);
    return MAGIC_OFFER + payload;
  };

  /* Hôte : reçoit la réponse scannée. */
  Net.prototype.acceptAnswer = async function (code) {
    code = (code || '').trim();
    if (code.indexOf(MAGIC_ANSWER) !== 0) throw new Error('Ce QR code n’est pas une réponse valide.');
    var sdp = await decodePayload(code.slice(MAGIC_ANSWER.length));
    await this.pc.setRemoteDescription({ type: 'answer', sdp: sdp });
  };

  /* Invité : reçoit l'offre scannée, renvoie la réponse à afficher en QR. */
  Net.prototype.joinWithOffer = async function (code) {
    code = (code || '').trim();
    if (code.indexOf(MAGIC_OFFER) !== 0) throw new Error('Ce QR code n’est pas une invitation valide.');
    var sdp = await decodePayload(code.slice(MAGIC_OFFER.length));
    this.role = 'guest';
    this._newPc();
    var self = this;
    this.pc.addEventListener('datachannel', function (ev) {
      self._bindChannel(ev.channel);
    });
    await this.pc.setRemoteDescription({ type: 'offer', sdp: sdp });
    var answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitIceComplete(this.pc);
    var payload = await encodePayload(this.pc.localDescription.sdp);
    return MAGIC_ANSWER + payload;
  };

  Net.prototype.send = function (obj) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify(obj));
      return true;
    }
    return false;
  };

  Net.prototype.isOpen = function () {
    return !!(this.dc && this.dc.readyState === 'open');
  };

  Net.prototype.close = function () {
    if (this.dc) { try { this.dc.close(); } catch (e) {} }
    if (this.pc) { try { this.pc.close(); } catch (e) {} }
    this.dc = null;
    this.pc = null;
  };

  /* ---------- QR : affichage et lecture ---------- */

  var QR = {
    /* Dessine un QR (SVG) dans un élément. */
    render: function (el, text) {
      var qr = qrcode(0, 'L'); // typeNumber auto ; correction L = modules plus gros
      qr.addData(text, 'Byte');
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
      var svg = el.querySelector('svg');
      if (svg) {
        svg.removeAttribute('width');
        svg.removeAttribute('height');
      }
    },

    /* Scanne avec la caméra ; renvoie un objet {stop}. onResult(text). */
    scan: function (videoEl, onResult, onError) {
      var stream = null;
      var running = true;
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d', { willReadFrequently: true });

      function stop() {
        running = false;
        if (stream) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          stream = null;
        }
        videoEl.srcObject = null;
      }

      function tick() {
        if (!running) return;
        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (found && found.data) {
            stop();
            onResult(found.data);
            return;
          }
        }
        requestAnimationFrame(tick);
      }

      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      }).then(function (s) {
        if (!running) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        videoEl.srcObject = s;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.play();
        requestAnimationFrame(tick);
      }).catch(function (err) {
        if (onError) onError(err);
      });

      return { stop: stop };
    }
  };

  root.Net = Net;
  root.QRTool = QR;
})(window);
