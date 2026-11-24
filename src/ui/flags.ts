// 主要国の旗（簡略化したもの）
export function flagSVG(id: string, color = '#888', w = 60, h = 40): string {
  const v = `viewBox="0 0 60 40" width="${w}" height="${h}" role="img" aria-hidden="true"`;
  switch (id) {
    case '840': {
      let st = ''; for (let i = 0; i < 7; i++) st += `<rect y="${i * 40 / 6.5}" width="60" height="${40 / 13}" fill="#B22234"></rect>`;
      let dots = ''; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) dots += `<circle cx="${3 + c * 4.6}" cy="${2.6 + r * 4.8}" r="0.9" fill="#fff"></circle>`;
      return `<svg ${v}><rect width="60" height="40" fill="#fff"></rect>${st}<rect width="24" height="21.5" fill="#3C3B6E"></rect>${dots}</svg>`;
    }
    case '156': return `<svg ${v}><rect width="60" height="40" fill="#DE2910"></rect><path d="M10 5 l2.4 7 7.4 0 -6 4.4 2.3 7 -6.1 -4.3 -6 4.3 2.3 -7 -6 -4.4 7.4 0z" fill="#FFDE00"></path></svg>`;
    case '643': return `<svg ${v}><rect width="60" height="13.4" fill="#fff"></rect><rect y="13.3" width="60" height="13.4" fill="#0039A6"></rect><rect y="26.6" width="60" height="13.4" fill="#D52B1E"></rect></svg>`;
    case '392': return `<svg ${v}><rect width="60" height="40" fill="#fff"></rect><circle cx="30" cy="20" r="12" fill="#BC002D"></circle></svg>`;
    case '826': return `<svg ${v}><rect width="60" height="40" fill="#012169"></rect><path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" stroke-width="8"></path><path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" stroke-width="3"></path><path d="M30 0 V40 M0 20 H60" stroke="#fff" stroke-width="12"></path><path d="M30 0 V40 M0 20 H60" stroke="#C8102E" stroke-width="7"></path></svg>`;
    case '250': return `<svg ${v}><rect width="20" height="40" fill="#0055A4"></rect><rect x="20" width="20" height="40" fill="#fff"></rect><rect x="40" width="20" height="40" fill="#EF4135"></rect></svg>`;
    case '276': return `<svg ${v}><rect width="60" height="13.4" fill="#000"></rect><rect y="13.3" width="60" height="13.4" fill="#DD0000"></rect><rect y="26.6" width="60" height="13.4" fill="#FFCE00"></rect></svg>`;
    case '356': return `<svg ${v}><rect width="60" height="13.4" fill="#FF9933"></rect><rect y="13.3" width="60" height="13.4" fill="#fff"></rect><rect y="26.6" width="60" height="13.4" fill="#138808"></rect><circle cx="30" cy="20" r="4.5" fill="none" stroke="#000080" stroke-width="1.2"></circle></svg>`;
    default: return `<svg ${v}><rect width="60" height="40" fill="${color}"></rect></svg>`;
  }
}
