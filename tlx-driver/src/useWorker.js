import { useEffect, useRef, useState, useCallback } from "react";
import { getToken, WS_BASE } from "./api.js";

export function useWorker() {
  const [connected, setConnected] = useState(false);
  const [trips, setTrips] = useState([]);
  const [states, setStates] = useState({});
  const [wonTrip, setWonTrip] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState([]);
  const [qr, setQr] = useState(null);
  const [zaloReady, setZaloReady] = useState(false);
  const [zaloExpired, setZaloExpired] = useState(false);
  const [limit, setLimitState] = useState(20);
  const wsRef = useRef(null);
  const tripIndex = useRef(new Map());
  const limitRef = useRef(20);

  const setLimit = useCallback((n) => {
    limitRef.current = n;
    setLimitState(n);
    setTrips(prev => prev.slice(0, n));
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let alive = true, retry;
    function connect() {
      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => alive && setConnected(true);
      ws.onclose = () => { if (!alive) return; setConnected(false); retry = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "groups") { setGroups(m.groups || []); setSelected(m.selected || []); setZaloExpired(false); }
        if (m.type === "qr") setQr(m.image);
        if (m.type === "zalo_ready") { setZaloReady(true); setQr(null); setZaloExpired(false); }
        if (m.type === "zalo_logout") { setZaloReady(false); setQr(null); setGroups([]); setTrips([]); setZaloExpired(false); }
        if (m.type === "zalo_expired") { setZaloExpired(true); setGroups([]); }
        if (m.type === "trip") {
          const t = m.trip; t._ts = Date.now();
          setTrips(prev => {
            tripIndex.current.set(t.msgId, t);
            const next = [t, ...prev].slice(0, limitRef.current);
            const keep = new Set(next.map(x => x.msgId));
            for (const k of tripIndex.current.keys()) if (!keep.has(k)) tripIndex.current.delete(k);
            return next;
          });
        }
        if (m.type === "taken") setStates(s => ({ ...s, [m.msgId]: "pending" }));
        if (m.type === "take_failed") setStates(s => ({ ...s, [m.msgId]: "idle" }));
        if (m.type === "cancelled") setStates(s => { const n = { ...s }; delete n[m.msgId]; return n; });
        if (m.type === "won") {
          setStates(s => ({ ...s, [m.msgId]: "won" }));
          setWonTrip(tripIndex.current.get(m.msgId) || { ...m });
        }
      };
    }
    connect();
    return () => { alive = false; clearTimeout(retry); wsRef.current?.close(); };
  }, []);

  const send = (obj) => { const ws = wsRef.current; if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
  const take = useCallback((trip) => { setStates(s => ({ ...s, [trip.msgId]: "pending" })); send({ action: "take", groupId: trip.groupId, msgId: trip.msgId, ownerId: trip.senderId, text: trip.text, trip }); }, []);
  const cancel = useCallback((trip) => { send({ action: "cancel", msgId: trip.msgId }); }, []);
  const setWatchedGroups = useCallback((groupIds) => { setSelected(groupIds); send({ action: "setGroups", groupIds }); }, []);
  const clearWon = useCallback(() => setWonTrip(null), []);

  return { connected, trips, states, take, cancel, wonTrip, clearWon, groups, selected, setWatchedGroups, qr, zaloReady, zaloExpired, limit, setLimit };
}
