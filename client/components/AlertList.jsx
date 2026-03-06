import AlertCard from "./AlertCard";

function AlertList({ alerts }) {
  return (
    <div>
      {alerts.map(alert => (
        <AlertCard key={alert._id} alert={alert} />
      ))}
    </div>
  );
}

export default AlertList;