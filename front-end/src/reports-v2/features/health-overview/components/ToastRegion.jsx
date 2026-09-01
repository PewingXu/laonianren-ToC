export function ToastRegion({ notification }) {
  return (
    <div
      className="health-overview__toast"
      aria-label="通知"
      aria-live="polite"
      aria-atomic="true"
      data-visible={Boolean(notification.message)}
    >
      {notification.message ? (
        <span key={notification.id}>{notification.message}</span>
      ) : null}
    </div>
  );
}
