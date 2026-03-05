import { useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

function App() {

  const [alerts, setAlerts] = useState([]);

  useEffect(() => {

    async function loadAlerts() {
      const res = await axios.get("http://localhost:5000/alerts");
      setAlerts(res.data);
    }

    loadAlerts();

    socket.on("new-alert", (alert) => {
      setAlerts(prev => [alert, ...prev]);
    });

  }, []);

  return (
    <div style={{padding:"40px", fontFamily:"Arial"}}>
      <h1>Wireless IDS Dashboard</h1>

      {alerts.map(a => (
        <div key={a._id} style={{
          border:"1px solid #444",
          marginBottom:"15px",
          padding:"15px",
          borderRadius:"8px"
        }}>

          <h3>{a.type}</h3>

          <p><b>Signal:</b> {a.signal}</p>
          <p><b>BSSID:</b> {a.bssid}</p>

          <p>
            <b>MITRE:</b> {a.mitre?.technique_id} – {a.mitre?.name}
          </p>

          <p>{a.mitre?.description}</p>

        </div>
      ))}

    </div>
  );
}

export default App;