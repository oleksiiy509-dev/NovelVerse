import { useNetworkStatus } from "../hooks/useNetworkStatus";
import "./NetworkBanner.css";

function NetworkBanner() {
  const { online, message } = useNetworkStatus();
  if (!message) return null;
  return <div className={online ? "network-banner" : "network-banner network-banner--offline"}>{message}</div>;
}

export default NetworkBanner;
