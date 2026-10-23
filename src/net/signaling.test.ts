import { describe, expect, it } from 'vitest';
import {
  buildInviteLink,
  decodeSignal,
  encodeSignal,
  extractSignalCode,
  SIGNAL_VERSION,
} from './signaling';

const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:0123456789abcdef0123456789abcdef',
  'a=fingerprint:sha-256 12:34:56:78:90:AB:CD:EF',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  'a=candidate:1 1 udp 2113937151 192.168.1.20 54321 typ host generation 0',
  'a=candidate:2 1 udp 2113937151 203.0.113.7 54321 typ srflx generation 0',
].join('\r\n');

describe('signalisation', () => {
  it('compresse et décompresse une offre sans perte', () => {
    const code = encodeSignal({ v: SIGNAL_VERSION, type: 'offer', sdp: SDP });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeGreaterThan(20);
    expect(decodeSignal(code)).toEqual({ v: SIGNAL_VERSION, type: 'offer', sdp: SDP });
  });

  it('conserve une réponse et les caractères non ASCII', () => {
    const answer = `${SDP}\r\na=x-test:éàü`;
    const code = encodeSignal({ v: SIGNAL_VERSION, type: 'answer', sdp: answer });
    expect(decodeSignal(`  ${code}\n`)).toEqual({
      v: SIGNAL_VERSION,
      type: 'answer',
      sdp: answer,
    });
  });

  it('refuse un code tronqué, vide ou d’une autre version', () => {
    expect(decodeSignal('')).toBeNull();
    expect(decodeSignal('pas-un-code')).toBeNull();
    expect(decodeSignal('AAAA')).toBeNull();
    const code = encodeSignal({ v: SIGNAL_VERSION, type: 'offer', sdp: SDP });
    expect(decodeSignal(code.slice(0, -4))).toBeNull();
  });

  it('construit et relit un lien d’invitation', () => {
    const code = encodeSignal({ v: SIGNAL_VERSION, type: 'offer', sdp: SDP });
    const link = buildInviteLink(code, {
      origin: 'https://exemple.fr',
      pathname: '/prisme/',
    });
    expect(link).toBe(`https://exemple.fr/prisme/#/invite/${code}`);
    expect(extractSignalCode(link)).toBe(code);
    expect(extractSignalCode(`#/invite/${code}`)).toBe(code);
    expect(extractSignalCode(` ${code} `)).toBe(code);
    expect(extractSignalCode('')).toBeNull();
    expect(extractSignalCode('https://exemple.fr/#/autre')).toBeNull();
  });
});
