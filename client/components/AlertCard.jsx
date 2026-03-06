import AlertChat from "./AlertChat";

function AlertCard({ alert }) {

  return (
    <div style={{
      border: "1px solid #ccc",
      borderRadius: "8px",
      padding: "16px",
      marginBottom: "12px"
    }}>

      <h3>{alert.type}</h3>

      <p>
        <b>Signal:</b> {alert.signal}
      </p>

      <p>
        <b>MITRE Technique:</b> {alert.mitre?.technique_id}
      </p>

      <p>
        <b>Technique Name:</b> {alert.mitre?.name}
      </p>

      {/* Chat Interface */}
      <AlertChat alertId={alert._id} />

    </div>
  );
}

export default AlertCard;