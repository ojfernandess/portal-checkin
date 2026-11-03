export type FnrhDocumento = {
  numero_documento: string;
  tipo_documento_id: "CPF" | "RG" | "PASSPORT" | string;
};

export type FnrhDadosPessoais = {
  nome: string;
  nome_social: string;
  PaisNacionalidade_id: string;
  genero_id: "HOMEM" | "MULHER" | "OUTRO" | string;
  GeneroDescricao: string;
  data_nascimento: string;
  raca_id: string;
  deficiencia_id: string;
  tipo_deficiencia_id: string;
  documento_id: FnrhDocumento;
  contato: {
    email: string;
    telefone: string;
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    PaisResidencia_id: string;
    cidade_id: number;
    estado_id: string;
  };
};

export type FnrhHospede = {
  is_principal: boolean;
  situacao_hospede: "CHECKIN_REALIZADO";
  situacao_hospede_id: "CHECKIN_REALIZADO";
  check_in_em: string;
  checkin_em: string;
  check_out_em: null;
  checkout_em: null;
  responsavel?: FnrhDocumento;
  dados_pessoais: FnrhDadosPessoais;
  fnrh: {
    motivo_viagem_id: string;
    meio_transporte_id: string;
    pais_origem_id: string;
    pais_destino_id: string;
    cidade_origem_id: number;
    cidade_destino_id: number;
  };
};

export type FnrhPayload = {
  reserva: {
    numero_reserva: string;
    numero_reserva_ota: string;
    data_entrada: string;
    data_saida: string;
    quantidade_hospede_adulto: number;
    quantidade_hospede_menor: number;
    origem_reserva_id: string;
  };
  dados_hospede: FnrhHospede[];
};
