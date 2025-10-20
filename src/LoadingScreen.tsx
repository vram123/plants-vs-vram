import React, { useEffect, useState } from "react";
import "./styles/global.css";

const LoadingScreen: React.FC<{ onLoaded: () => void }> = ({ onLoaded }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          onLoaded();
          return 100;
        }
        return p + 5;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [onLoaded]);

  return (
    <div className="loading-screen">
      <img
        src="/src/assets/images/loading.png"
        alt="Loading background"
        className="loading-bg"
      />
      <div className="loading-overlay">
        <h1 className="loading-title">Plants VS Vram</h1>
        <div className="loading-bar">
          <div className="loading-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="loading-text">Loading... {progress}%</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
