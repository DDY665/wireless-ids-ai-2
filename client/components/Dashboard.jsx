import { useEffect, useState } from "react";
import AlertList from "./AlertList";

function Dashboard() {

  const [alerts, setAlerts] = useState([]);

  const fetchAlerts = async () => {

    const res = await fetch("http://localhost:5000/alerts");
    const data = await res.json();

    setAlerts(data);

  };

  useEffect(() => {
    async function init() {
      await fetchAlerts();
    }
    init();
  }, []);

  return (
    <div style={{ padding: "30px" }}>

      <h1>Wireless IDS Dashboard</h1>

      <AlertList alerts={alerts} />

    </div>
  );
}

export default Dashboard;