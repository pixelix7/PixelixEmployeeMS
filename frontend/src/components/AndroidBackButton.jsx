import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isNativeApp } from "../utils/saveFile";
import { closeTopLayer } from "../utils/backButton";
import { APP_NAME } from "../config";
import Modal from "./Modal";
import "./AndroidBackButton.css";

// Screens where "back" means "leave the app"
const EXIT_SCREENS = ["/dashboard", "/login", "/"];

// Android hardware back button (app only — does nothing on the website):
//   dialog / menu open -> close it
//   on Dashboard or Login -> ask before exiting
//   anywhere else -> previous screen (or Dashboard if there is none)
export default function AndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [askExit, setAskExit] = useState(false);

  // The listener is registered once; read the latest route through a ref
  const pathRef = useRef(location.pathname);
  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let handle;
    let cancelled = false;

    import("@capacitor/app").then(({ App }) =>
      App.addListener("backButton", () => {
        // The exit question itself is a dialog, so back = "No"
        if (closeTopLayer()) return;

        if (EXIT_SCREENS.includes(pathRef.current)) {
          setAskExit(true);
          return;
        }
        // React Router keeps the history position in history.state.idx
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate("/dashboard", { replace: true });
      }).then((h) => {
        if (cancelled) h.remove();
        else handle = h;
      })
    );

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [navigate]);

  const exit = async () => {
    const { App } = await import("@capacitor/app");
    App.exitApp();
  };

  if (!askExit) return null;

  return (
    <Modal title={`Exit ${APP_NAME}?`} size="sm" onClose={() => setAskExit(false)}>
      <p className="exit-text">Do you want to close the app?</p>
      <div className="exit-actions">
        <button type="button" className="button button-secondary" onClick={() => setAskExit(false)} autoFocus>
          No
        </button>
        <button type="button" className="button button-primary" onClick={exit}>
          Yes, Exit
        </button>
      </div>
    </Modal>
  );
}
