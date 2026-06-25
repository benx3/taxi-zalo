import { useState, useEffect, useRef, useCallback } from "react";
import { getToken, WS_BASE } from "./api.js";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8082";
async function fetchPendingQR() {
  const token = getToken();
  if (!token) return null;
  try {
    const r = await fetch(`${API_BASE}/api/zalo/pending-qr`, { headers: { Authorization: "Bearer " + token } });
    const d = await r.json();
    return d.image || null;
  } catch { return null; }
}

export default function useAccountantWorker() {
  const [wsConnected, setWsConnected] = useState(false);
  const [zaloConnected, setZaloConnected] = useState(false);
  const [qrImage, setQrImage] = useState(null);
  const [zaloError, setZaloError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [zaloGroups, setZaloGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [groupConflict, setGroupConflict] = useState(null); // {groupName, ownerName}
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const send = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(obj));
  }, []);

  const connect = useCallback(() => {
    const token = getToken();
    if (!token) return;
    clearTimeout(reconnectTimer.current);
    const ws = new WebSocket(`${WS_BASE}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Sau khi WS kết nối lại, fetch QR qua HTTP nếu đang chờ (WS có thể đã ngắt đúng lúc server push QR)
      setTimeout(async () => {
        const img = await fetchPendingQR();
        if (img) setQrImage(img);
      }, 500);
    };
    ws.onclose = () => {
      setWsConnected(false);
      reconnectTimer.current = setTimeout(connect, 4000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "groups") {
          setZaloGroups(msg.groups || []);
          setSelectedGroups(msg.selected || []);
          if ((msg.groups || []).length > 0) setZaloConnected(true);
        }
        if (msg.type === "qr") { setQrImage(msg.image); setZaloConnected(false); setZaloError(null); setSessionExpired(false); }
        if (msg.type === "zalo_ready") { setQrImage(null); setZaloConnected(true); setZaloError(null); setSessionExpired(false); }
        if (msg.type === "zalo_error") { setQrImage(null); setZaloError(msg.error || "Lỗi đăng nhập Zalo"); }
        if (msg.type === "zalo_logout" || msg.type === "zalo_expired") {
          setZaloConnected(false); setZaloGroups([]); setSelectedGroups([]); setZaloError(null); setSessionExpired(false);
        }
        if (msg.type === "zalo_session_expired") {
          setZaloConnected(false); setSessionExpired(true); setZaloError(null);
        }
        if (msg.type === "pending_transfer") {
          setPendingTransfers(prev => [msg, ...prev]);
        }
        if (msg.type === "group_conflict") {
          setGroupConflict({ groupName: msg.groupName, ownerName: msg.ownerName });
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [connect]);

  const setWatchedGroups = useCallback((groupIds) => {
    send({ action: "setGroups", groupIds });
  }, [send]);

  const removePending = useCallback((txId) => {
    setPendingTransfers(prev => prev.filter(t => t.txId !== txId));
  }, []);

  return {
    wsConnected, zaloConnected, qrImage, zaloError, sessionExpired,
    zaloGroups, selectedGroups, setWatchedGroups,
    pendingTransfers, removePending,
    groupConflict, clearGroupConflict: () => setGroupConflict(null),
    send, connect,
  };
}
