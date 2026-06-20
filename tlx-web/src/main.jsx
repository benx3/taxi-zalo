import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AccountantApp from "./accountant/App.jsx";

const path = window.location.pathname;

if (path.startsWith("/accountant")) {
  document.title = "Kế Toán — Trợ Lý Tài Xế AI";
} else {
  document.title = "Admin — Trợ Lý Tài Xế AI";
}

const Root = path.startsWith("/accountant") ? AccountantApp : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
