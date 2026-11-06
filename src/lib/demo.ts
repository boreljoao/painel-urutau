/** Contas da demonstração: e-mail num domínio que não existe, apagadas depois de um dia. */
export const DOMINIO_DEMO = "demo.painel.invalid";
export const HORAS_DEMO = 24;
export const ehDemo = (email: string) => email.endsWith(`@${DOMINIO_DEMO}`);
