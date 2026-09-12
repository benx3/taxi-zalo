import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PublicPointsPage from "./PublicPointsPage.jsx";
import GuidePage from "./GuidePage.jsx";

const path = window.location.pathname;

const isPoints = path.startsWith("/tinh-diem-tai-xe-zalo") ||
                 path.startsWith("/xem-diem");

// Trang hướng dẫn công khai — ai cũng đọc được, không cần đăng nhập
const isGuide = path.startsWith("/huong-dan") ||
                path.startsWith("/noi-quy");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isGuide ? <GuidePage /> : isPoints ? <PublicPointsPage /> : <App />}
  </React.StrictMode>
);
