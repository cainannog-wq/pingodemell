// Cartão do mapa: ilustração abstrata (quadras, ruas e o pino), sem nome de
// rua nem endereço. Não é mapa de verdade e não carrega nada de fora: o
// mapa incorporado do Google mandaria o IP da visitante ao Google e poria
// cookies (Cainan, PR quem-somos). O endereço fica no texto da página e o
// único link é o botão "Abrir no Google Maps". Por isso o cartão inteiro
// fica fora do leitor de tela e da ordem de foco.
export function MapaIlustrado() {
  return (
    <div className="qs-mapa" aria-hidden="true">
      <svg viewBox="0 0 480 300" preserveAspectRatio="xMidYMid slice" focusable="false">
        <rect width="480" height="300" fill="var(--cream-200)" />
        <g fill="var(--brown-050)">
          <rect x="-10" y="-10" width="150" height="90" rx="10" />
          <rect x="170" y="-10" width="120" height="90" rx="10" />
          <rect x="320" y="-10" width="180" height="90" rx="10" />
          <rect x="-10" y="110" width="150" height="80" rx="10" />
          <rect x="320" y="110" width="180" height="80" rx="10" />
          <rect x="-10" y="220" width="150" height="90" rx="10" />
          <rect x="170" y="220" width="120" height="90" rx="10" />
          <rect x="320" y="220" width="180" height="90" rx="10" />
        </g>
        <rect x="170" y="110" width="120" height="80" rx="10" fill="var(--gold-100)" />
        <path d="M-20 262 C 120 250, 260 300, 500 240" stroke="var(--brown-100)" strokeWidth="10" fill="none" />
        <g transform="translate(230 58)">
          <ellipse cx="0" cy="98" rx="22" ry="7" fill="rgba(42, 24, 6, 0.18)" />
          <path
            d="M0 96 C -8 80, -34 58, -34 34 A 34 34 0 1 1 34 34 C 34 58, 8 80, 0 96 Z"
            fill="var(--brown-700)"
          />
          <circle cx="0" cy="34" r="14" fill="var(--gold-500)" />
        </g>
      </svg>
    </div>
  );
}
