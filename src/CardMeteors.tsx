const meteors = [
  { left: "10%", delay: "0s", duration: "5.4s" },
  { left: "34%", delay: "1.4s", duration: "6.1s" },
  { left: "58%", delay: "0.7s", duration: "5.8s" },
  { left: "82%", delay: "2.2s", duration: "6.6s" },
];

export function CardMeteors({ count = 3 }: { count?: number }) {
  return (
    <span className="card-meteors" aria-hidden="true">
      {meteors.slice(0, count).map((meteor) => (
        <i
          key={meteor.left}
          style={{
            left: meteor.left,
            animationDelay: meteor.delay,
            animationDuration: meteor.duration,
          }}
        />
      ))}
    </span>
  );
}
