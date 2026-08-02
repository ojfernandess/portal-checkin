# Welcome Inn

PROMPT DE DESENVOLVIMENTO — PORTAL WEB CHECK-IN HOTELEIRO

VISÃO GERAL DO PROJETO

Desenvolva um Portal de Web Check-in Hoteleiro completo, seguro e responsivo, otimizado para dispositivos móveis. O sistema deve permitir que hóspedes realizem o check-in de forma autônoma, guiada e intuitiva, integrando-se a uma API REST existente. O portal também deve possuir um painel administrativo com dois níveis de acesso: Super Admin e Admin por Estabelecimento.

STACK TECNOLÓGICA RECOMENDADA

Frontend

Framework: Next.js 14+ (App Router) com TypeScript

Estilização: Tailwind CSS + shadcn/ui

Formulários: React Hook Form + Zod (validação)

Upload de imagens / câmera: react-webcam ou API nativa getUserMedia

Estado global: Zustand ou Context API

HTTP Client: Axios com interceptors para autenticação

Animações: Framer Motion (transições entre etapas)

Backend (Painel Admin)

Framework: Node.js com NestJS ou Next.js API Routes

Banco de dados: PostgreSQL (via Prisma ORM)

Autenticação: JWT + Refresh Token + bcrypt

Auditoria: Log de todas as ações administrativas

Upload: AWS S3 ou similar para armazenar mídias do check-in

Infraestrutura

Deploy: Vercel (frontend) + Railway ou Render (backend admin)

HTTPS obrigatório em todas as rotas

CORS configurado por domínio autorizado

Rate limiting nas rotas públicas do check-in

DESIGN SYSTEM — IDENTIDADE VISUAL

Paleta de Cores

--primary:       #1A2744   (azul-marinho profundo — confiança, hospitalidade)
--accent:        #C9A96E   (dourado suave — elegância hoteleira)
--surface:       #F8F7F4   (off-white quente — acolhimento)
--surface-card:  #FFFFFF
--text-primary:  #1A1A2E
--text-muted:    #6B7280
--success:       #22C55E
--warning:       #F59E0B
--error:         #EF4444
--border:        #E5E7EB


Tipografia

Display / Títulos: "Playfair Display" (serif elegante — remete a hotelaria premium)
Corpo / UI:        "Inter" (sans-serif neutro e legível em mobile)
Dados / Códigos:   "JetBrains Mono" (localizadores, números de quarto)


Princípios de UX/UI Mobile-First

Tap targets mínimos de 48px

Padding horizontal de 20px nas bordas

Progresso visual claro entre etapas (stepper no topo)

Feedback imediato a cada ação (loading states, toasts, animações)

Suporte a prefers-reduced-motion

Contraste mínimo WCAG AA

FLUXO COMPLETO DO HÓSPEDE

ETAPA 0 — Tela de Entrada / Busca por Localizador

Endpoint: GET /api/reservations/localizer/{localizadorOuReservationId}

Interface:

Logo do portal centralizado no topo

Campo de texto grande e proeminente: "Digite seu código de reserva"

Placeholder: "Ex: OMRTULVP"

Transformar automaticamente para maiúsculas

Permitir busca também por reservationId numérico

Botão "Buscar Reserva" com loading state

Link de ajuda: "Onde encontro meu código?" com modal explicativo

Após localizar com sucesso — exibir card de resumo:

┌─────────────────────────────────────┐
│  🏨 [establishmentName]             │
│  ─────────────────────────────────  │
│  Categoria: [categoryName]          │
│  Quarto: [roomName]                 │
│                                     │
│  👤 Responsável: [responsible.name] │
│  🗓 Check-in:  [checkinDate] [checkinTime] │
│  🗓 Check-out: [checkoutDate] [checkoutTime] │
│  🛏 Hóspedes: [guestsQuantity]      │
│  🌙 Noites: [nights]                │
│                                     │
│  Status: [label badge colorido]     │
└─────────────────────────────────────┘


Lógica de status do check-in:

Verificar o objeto checkin: se todos os campos forem 0 e localizedDate for null → reserva sem check-in → exibir botão "Realizar Check-in"

Se checkin_mobile: 1 ou checkinApi: 1 → check-in já realizado → exibir mensagem informativa com status e data/hora do check-in (localizedDate)

Se isCancelled: true → exibir aviso de reserva cancelada, bloquear fluxo

Se isPendingCancellation: true → exibir aviso de cancelamento pendente

ETAPA 1 — Confirmação de Responsabilidade

Ao clicar em "Realizar Check-in":

Modal ou tela com pergunta:

"Você é o responsável pela reserva?"

Esta reserva está no nome de [responsible.name].

Botão: "Sim, sou eu" → avançar para Etapa 2

Botão: "Não, sou acompanhante" → exibir mensagem orientando que somente o responsável pode iniciar o check-in

ETAPA 2 — Políticas do Estabelecimento

Endpoint de consulta: GET /api/admin/establishments/{establishmentId}/terms (endpoint interno do painel admin — ver seção de admin)

Exibir o nome do estabelecimento no cabeçalho

Bloco de texto scrollável com os termos e condições

Checkbox obrigatório: "Li e aceito os termos e políticas do estabelecimento"

Botão "Continuar" desabilitado até aceite

Permitir que o admin configure os termos por establishmentId (ver painel admin)

ETAPA 3 — Identificação do Hóspede

Pergunta: "Qual é a sua nacionalidade?"

Botão: 🇧🇷 Brasileiro(a)

Botão: 🌍 Estrangeiro(a)

ETAPA 4A — Hóspede Brasileiro

Campo: CPF

Máscara: 000.000.000-00

Validação de CPF (algoritmo de dígitos verificadores)

Botão: "Verificar"

Lookup: GET /api/reservations/hub/main-guest/lookup?documentNumber={cpf}

Cenário A — Hóspede encontrado:

Exibir card com dados encontrados:

Nome, e-mail, telefone, CPF, tipo de documento

Fotos se disponíveis (profilePhotoUrl, documentPhotoUrl)

Mensagem: "Encontramos seu cadastro! Confirme seus dados abaixo."

Botão "Confirmar e Continuar" → pré-preencher formulário com dados existentes e avançar para Etapa 5

Cenário B — Hóspede não encontrado:

Exibir formulário completo para cadastro:

Dados Pessoais:
  • Nome completo *
  • E-mail *
  • Telefone celular (com +55) *
  • Data de nascimento *
  • Gênero (Masculino / Feminino / Outro) *
  • Profissão
  • Naturalidade / Cidadania

Documento:
  • Tipo (CPF / RG) *
  • Número do documento *
  • RG (se aplicável)
  • Órgão expedidor (ex: SSP/SP)

Endereço:
  • CEP * (buscar endereço automaticamente via ViaCEP)
  • Logradouro
  • Número
  • Bairro
  • Cidade
  • Estado
  • País


ETAPA 4B — Hóspede Estrangeiro

Campo: Número do Passaporte

Aceitar letras e números (ex: A882271739)

Não solicitar CPF

Lookup: GET /api/reservations/hub/main-guest/lookup?documentNumber={passaporte}&documentType=PASSPORT

Cenário A — Encontrado: mesmo fluxo da 4A Cenário B — Não encontrado: formulário simplificado:

  • Nome completo *
  • E-mail *
  • Número do Passaporte *
  • País de origem / Cidadania *
  • Gênero *
  • Data de nascimento *
  • Telefone (opcional)


documentType → "PASSPORT" (nunca inventar CPF para estrangeiros)

ETAPA 5 — Hóspede Acompanhante (condicional)

Verificar: guestsQuantity > 1 E room.capacity > 1

Se verdadeiro, exibir tela informativa:

"Sua reserva é para [guestsQuantity] hóspede(s)" Deseja cadastrar os dados do(s) acompanhante(s)?

Botão: "Sim, cadastrar acompanhante" → formulário de dependente:

• Nome completo *
• Número do documento *
• Tipo de documento *
• Gênero *
• (opcional) FNRH ID


Permitir adicionar múltiplos dependentes até guestsQuantity - 1

Botão: "Não, continuar" → pular para Etapa 6

ETAPA 6 — Fotos do Hóspede

Endpoint: POST /api/reservations/hub/{reservationIdOrLocalizer}/checkin/media

Sub-etapa 6A — Selfie (foto do rosto):

Instrução clara: "Tire uma selfie segurando o documento próximo ao rosto"

Botão para abrir câmera frontal via getUserMedia

Alternativa: upload de arquivo

Preview da foto capturada com opção de refazer

Envio com { "data": "{{base64}}", "type": "profile" }

Armazenar URL retornada em profilePhotoUrl

Sub-etapa 6B — Foto do Documento:

Instrução: "Fotografe a frente do seu documento (RG, CPF ou Passaporte)"

Botão para abrir câmera traseira

Alternativa: upload de arquivo

Preview com opção de refazer

Envio com { "data": "{{base64}}", "type": "document" }

Armazenar URL retornada em documentPhotoUrl

ETAPA 7 — Ficha Embratur (FNRH Digital)

Endpoint de referência: GET /api/reservations/hub/embratur-reference

Carregar as listas de opções antes de renderizar o formulário.

Campos obrigatórios:

Campo Label para o Hóspede Tipo snmotvia Motivo da viagem Select (lista da API) sntiptran Meio de transporte Select (lista da API) bgstdscpais País de origem Select com busca bgstdscpaisdest País de destino Select com busca snidcidadeibge Cidade de origem Select com busca (cód. IBGE) snidcidadeibgedest Cidade de destino Select com busca (cód. IBGE)

Pré-preencher bgstdscpaisdest e snidcidadeibgedest com o endereço do estabelecimento quando possível

Implementar busca incremental nos campos de cidade e país

ETAPA 8 — Envio Final do Check-in

Endpoint: POST /api/reservations/hub/{reservationIdOrLocalizer}/checkin

Payload completo:

{
  "mode": "digital",
  "fnrhId": null,
  "validatedCheckin": true,
  "approveCheckin": true,
  "sentToReception": true,
  "mainGuest": {
    "name": "...",
    "email": "...",
    "documentNumber": "...",
    "documentType": "CPF | PASSPORT | RG",
    "rg": "...",
    "expeditor": "...",
    "mobilePhoneNumber": "...",
    "birthDate": "YYYY-MM-DD",
    "gender": "MALE | FEMALE | OTHER",
    "profession": "...",
    "citizenship": "...",
    "zipCode": "...",
    "country": "...",
    "state": "...",
    "city": "...",
    "street": "...",
    "number": "...",
    "neighborhood": "...",
    "profilePhotoUrl": "...",
    "documentPhotoUrl": "..."
  },
  "embratur": {
    "snmotvia": "...",
    "sntiptran": "...",
    "bgstdscpais": "...",
    "bgstdscpaisdest": "...",
    "snidcidadeibge": "...",
    "snidcidadeibgedest": "..."
  },
  "dependents": [
    {
      "dependentId": null,
      "name": "...",
      "documentNumber": "...",
      "documentType": "...",
      "gender": "...",
      "fnrhId": null
    }
  ]
}


ETAPA 9 — Confirmação / Check-in Concluído

Tela de sucesso com design celebrativo (animação sutil de check ✓):

┌─────────────────────────────────────┐
│  ✅ Check-in Realizado com Sucesso! │
│                                     │
│  🏨 [establishmentName]             │
│  📍 [street], [number] — [city]/[state] │
│                                     │
│  🛏 [unitName] — Quarto [unitNumber] │
│  Categoria: [categoryName]          │
│                                     │
│  🗓 Entrada:  [checkinDate] às [checkinTime]  │
│  🗓 Saída:    [checkoutDate] às [checkoutTime] │
│  🌙 [nights] noite(s)               │
│                                     │
│  🔑 Senha do Quarto: [roomPassword] │  ← exibir apenas se não null
│                                     │
│  👤 Hóspedes: [guestsQuantity]      │
│  [lista de dependentes cadastrados] │
│                                     │
│  💳 Valor: R$ [price]               │
│  Status: [label]                    │
│                                     │
│  ─────────────────────────────────  │
│  🌟 Desejamos uma ótima estadia!    │
│                                     │
│  Precisa de ajuda durante a         │
│  sua estadia? Fale conosco:         │
│  📞 [TELEFONE/WHATSAPP configurável │
│       por estabelecimento no admin] │
└─────────────────────────────────────┘


Botão: "Salvar como PDF" (gerar comprovante)

Botão: "Compartilhar" (Web Share API)

STEPPER DE PROGRESSO (componente fixo no topo)

Busca → Confirmação → Termos → Identificação → Dados → Fotos → Embratur → ✅


Indicador visual de etapa atual (círculo preenchido)

Etapas concluídas com ícone de check

Não permitir navegar para frente sem completar etapa atual

Permitir voltar à etapa anterior sem perder dados (estado persistido em memória)

PAINEL ADMINISTRATIVO

Autenticação do Admin

Rota: /admin

Login com e-mail + senha

JWT com expiração de 8h + refresh token

2FA opcional (TOTP)

Bloqueio após 5 tentativas falhas

Log de acessos (IP, horário, user-agent)

Níveis de Acesso

Super Admin:

Acesso a todos os estabelecimentos

Criar/editar/desativar contas de Admin

Visualizar logs globais

Configurar campos extras globais

Gerenciar modelos de termos globais

Acessar métricas e relatórios consolidados

Admin (por Estabelecimento):

Acesso restrito ao(s) seu(s) establishmentId(s)

Visualizar check-ins do seu estabelecimento

Editar termos do estabelecimento

Configurar campos extras do estabelecimento

Visualizar e exportar relatórios do estabelecimento

Configurar telefone/WhatsApp de suporte exibido no portal

Funcionalidades do Painel Admin

Dashboard Principal

KPIs: Total de check-ins hoje / semana / mês

Gráfico de check-ins por horário (heatmap)

Listagem de check-ins recentes com status

Filtros: por estabelecimento, data, status

Gestão de Check-ins

Tabela com colunas:

Localizador | Hóspede | Estabelecimento | Quarto | Data/hora do check-in | Status | Canal | Ações

Ações disponíveis:

Visualizar detalhes (todos os dados enviados)

Editar (corrigir informações — registrar motivo no log de auditoria)

Reenviar para recepção (flag sentToReception)

Validar manualmente (validatedCheckin)

Exportar PDF do comprovante

Gestão de Termos por Estabelecimento

GET /api/admin/establishments → listar estabelecimentos

GET /api/admin/establishments/{id}/terms → buscar termos atuais

PUT /api/admin/establishments/{id}/terms → salvar novos termos

Editor rich text (TipTap ou Quill) para formatar os termos

Histórico de versões dos termos (quem editou, quando)

Prévia de como os termos aparecerão para o hóspede

Configuração de Campos Extras

Permitir que o admin adicione campos personalizados ao formulário de check-in por estabelecimento:

Tipos de campo: texto, select, checkbox, data, telefone

Obrigatório / Opcional

Label customizável

Ordem de exibição

Vinculado a etapa específica do fluxo

Configuração de Contato de Suporte

Por estabelecimento:

Telefone fixo

WhatsApp (número formatado para deep link wa.me/)

Exibido na tela final do check-in

Relatórios e Exportação

Exportar lista de check-ins em CSV / Excel

Relatório de FNRH (Embratur) por período

Filtros: estabelecimento, data início/fim, status

Agendamento de relatórios por e-mail (opcional)

Log de Auditoria

Registrar toda ação administrativa:

Usuário | Ação | Entidade afetada | Dados anteriores | Dados novos | IP | Timestamp

Não editável (append-only)

Filtros de busca por usuário, data, tipo de ação

ENDPOINTS A CONSUMIR (RESUMO)

Método Endpoint Uso GET /api/reservations/localizer/{id} Buscar reserva por localizador GET /api/reservations/hub/main-guest/lookup Verificar cadastro do hóspede POST /api/reservations/hub/{id}/checkin/media Upload de selfie e documento GET /api/reservations/hub/embratur-reference Listas para ficha Embratur POST /api/reservations/hub/{id}/checkin Realizar o check-in

Base URL: http://backend.techospitality.com

Importante: todas as chamadas à API externa devem passar por um proxy interno do Next.js (/api/proxy/...) para:

Ocultar a URL da API do cliente

Adicionar headers de autenticação server-side

Implementar rate limiting

Registrar chamadas para auditoria

REGRAS DE NEGÓCIO CRÍTICAS

Verificação de check-in existente: sempre checar objeto checkin antes de exibir botão de check-in

Responsável da reserva: somente o responsável pode iniciar o check-in

Quantidade de hóspedes: sempre comparar guestsQuantity com capacity para decidir se pergunta sobre acompanhante

Estrangeiros: nunca solicitar CPF — usar documentType: "PASSPORT" e aceitar alfanumérico

Lookup de hóspede: se já existe cadastro, reutilizar dados e não criar duplicata

Fotos: upload obrigatório de selfie e documento antes do envio do check-in

Embratur: todos os 6 campos são obrigatórios antes de enviar

Senha do quarto: exibir na tela final apenas se roomPassword não for null

Termos: obrigatório aceite explícito antes de prosseguir — registrar timestamp do aceite

Campos extras: inserir no payload do check-in conforme configuração do admin

SEGURANÇA

[ ] HTTPS em todas as rotas (certificado SSL obrigatório)

[ ] Proxy server-side para chamadas à API externa (sem exposição de credenciais no cliente)

[ ] Rate limiting: máximo 10 buscas de localizador por IP por hora

[ ] Sanitização de todos os inputs (XSS, SQL injection prevention)

[ ] Headers de segurança: CSP, HSTS, X-Frame-Options, X-Content-Type-Options

[ ] Dados sensíveis (documentos, fotos) trafegam apenas via HTTPS, nunca logados

[ ] JWT com expiração curta + refresh token rotation para o admin

[ ] Senhas do admin: mínimo 12 caracteres, hash bcrypt (cost 12)

[ ] LGPD: exibir política de privacidade antes do check-in; dados coletados apenas para fins da reserva

ACESSIBILIDADE E PERFORMANCE

Lighthouse score mínimo: Performance 90, Acessibilidade 95

Suporte a leitores de tela (aria-labels, roles semânticos)

Funciona em conexões lentas (3G): lazy loading, imagens comprimidas

PWA opcional: ícone na tela inicial, funcionamento offline parcial (formulário local)

Suporte mínimo: iOS Safari 15+, Chrome Android 100+

ESTRUTURA DE PASTAS SUGERIDA

/
├── app/
│   ├── (checkin)/
│   │   ├── page.tsx                 # Busca por localizador
│   │   ├── [localizer]/
│   │   │   ├── page.tsx             # Resumo da reserva
│   │   │   ├── terms/page.tsx       # Termos
│   │   │   ├── identity/page.tsx    # Identificação
│   │   │   ├── form/page.tsx        # Formulário de dados
│   │   │   ├── companions/page.tsx  # Acompanhantes
│   │   │   ├── photos/page.tsx      # Selfie + documento
│   │   │   ├── embratur/page.tsx    # Ficha Embratur
│   │   │   └── success/page.tsx     # Confirmação
│   └── admin/
│       ├── login/page.tsx
│       ├── dashboard/page.tsx
│       ├── checkins/page.tsx
│       ├── establishments/
│       │   ├── page.tsx
│       │   └── [id]/
│       │       ├── terms/page.tsx
│       │       └── fields/page.tsx
│       ├── users/page.tsx           # Super Admin only
│       ├── reports/page.tsx
│       └── audit/page.tsx
├── components/
│   ├── checkin/
│   │   ├── Stepper.tsx
│   │   ├── ReservationCard.tsx
│   │   ├── CameraCapture.tsx
│   │   └── ...
│   ├── admin/
│   │   ├── DataTable.tsx
│   │   ├── TermsEditor.tsx
│   │   └── ...
│   └── ui/                          # shadcn/ui components
├── lib/
│   ├── api/
│   │   ├── client.ts               # Axios instance + interceptors
│   │   ├── reservations.ts
│   │   ├── checkin.ts
│   │   └── embratur.ts
│   ├── validations/                # Zod schemas
│   └── utils/
├── store/
│   └── checkin-store.ts            # Zustand — estado do fluxo
└── middleware.ts                   # Proteção das rotas admin


ENTREGÁVEIS ESPERADOS

Portal de check-in (público, mobile-first) com todos os 9 fluxos implementados

Painel administrativo com autenticação, gestão de check-ins, termos e relatórios

Proxy API seguro ocultando credenciais da API externa

Documentação técnica (README com setup, variáveis de ambiente, deploy)

Banco de dados com migrations para: usuários admin, logs de auditoria, termos por estabelecimento, campos extras, configurações de contato

Prompt elaborado para desenvolvimento full-stack do Portal Web Check-in Hoteleiro — TecHospitality

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
