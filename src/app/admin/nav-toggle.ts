// Id compartilhado entre layout.tsx (dono do checkbox da gaveta mobile) e
// nav-link.tsx (fecha a gaveta ao trocar de rota). Uma única constante evita
// que os dois arquivos fiquem com strings divergentes depois de um rename.
export const ADMIN_NAV_TOGGLE_ID = "admin-nav-toggle";
