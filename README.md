# Corpo — acompanhamento de medidas corporais

App pessoal (PWA) para registrar peso, circunferências e dobras cutâneas, ver gráficos de
evolução e receber lembretes das medições. Funciona offline, instala na tela inicial do
celular e **guarda tudo apenas no aparelho** — não existe servidor nem conta.

## Recursos

- **Perfis ilimitados** — cada pessoa com histórico, altura, idade e cor próprios; troca pelo topo da tela.
- **Peso + 15 circunferências** — pescoço, ombro, tórax, cintura, abdômen, quadril, braços, antebraços, coxas, panturrilhas e punho.
- **7 dobras cutâneas** (adipômetro) com % de gordura calculado automaticamente.
- **Índices**: IMC, % de gordura, massa magra e gorda, cintura/quadril, cintura/altura, metabolismo basal e faixa de peso.
- **Gráficos** de qualquer métrica, por período, com opção de comparar dois perfis na mesma linha do tempo.
- **Lembretes** configuráveis (a cada 3/7/14/30/90 dias, no horário escolhido), com notificação no celular e aviso dentro do app.
- **Fotos de progresso** (frente, lado, costas) por medição, comprimidas e guardadas localmente.
- **Backup** completo em JSON (inclui as fotos) e exportação em CSV para abrir no Excel.
- Tema claro/escuro automático.

## Como publicar (GitHub Pages)

O repositório já traz o fluxo de publicação em `.github/workflows/pages.yml`.

1. No GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Faça push para a branch principal — o site sai em `https://<usuário>.github.io/<repositório>/`.

> As notificações e a instalação como app exigem HTTPS. O GitHub Pages já serve em HTTPS;
> abrir o arquivo direto do disco (`file://`) não funciona.

### Instalar no celular

- **Android (Chrome)**: abra o site → menu ⋮ → *Instalar app* / *Adicionar à tela inicial*.
- **iPhone (Safari)**: abra o site → botão compartilhar → *Adicionar à Tela de Início*.

Depois de instalado ele abre em tela cheia e funciona sem internet.

### Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Primeiros passos

1. Em **Ajustes**, preencha nome, sexo, data de nascimento e altura — sem isso o IMC, o % de
   gordura e o metabolismo não são calculados.
2. Ainda em Ajustes, crie o segundo perfil e preencha os dados dele.
3. Ative os **lembretes** e aceite a permissão de notificação quando o navegador pedir.
4. Em **Medir**, registre a primeira medição. Nem todo campo precisa ser preenchido.

## Como medir (para os números fazerem sentido)

O que importa é a **consistência**: mesma hora, mesmas condições, mesma pessoa medindo.

- **Peso**: de manhã, em jejum, após ir ao banheiro, sem roupa. Sempre a mesma balança.
- **Fita métrica**: encoste na pele sem apertar (não deve marcar), fita paralela ao chão,
  corpo relaxado, ao final de uma expiração normal. Meça sempre no mesmo ponto de referência:
  - *Cintura*: no ponto mais estreito, acima do umbigo.
  - *Abdômen*: na altura do umbigo.
  - *Quadril*: na maior circunferência dos glúteos.
  - *Braço*: no ponto médio entre ombro e cotovelo (defina se é relaxado ou contraído e mantenha o padrão).
- **Adipômetro**: sempre do **lado direito** do corpo, pegando pele e gordura entre os dedos
  (sem músculo), aplicando o aparelho 1 cm abaixo dos dedos e lendo após ~2 segundos.
  Faça 2–3 medidas em cada ponto e registre a média. Se faltar algum dos 7 pontos, o app usa
  o protocolo de 3 dobras automaticamente.
- **Frequência**: peso e circunferências semanalmente; dobras cutâneas a cada 3–4 semanas
  (mudam devagar e a variação entre medições é grande).

## Fórmulas usadas

| Índice | Fórmula |
| --- | --- |
| IMC e classificação | peso / altura² (faixas da OMS) |
| % de gordura | Jackson & Pollock (7 dobras; 3 dobras se faltar alguma) → Siri |
| Massa gorda / magra | peso × %GC e a diferença |
| Cintura/quadril e cintura/altura | razão direta, com faixas de risco de referência |
| Metabolismo basal | Katch-McArdle quando há massa magra; senão Mifflin-St Jeor |

São **estimativas para acompanhar tendência**, não diagnóstico. O valor absoluto de % de
gordura varia entre protocolos; o que interessa é a direção da curva ao longo do tempo.

## Backup — importante

Os dados vivem no armazenamento do navegador daquele aparelho. Eles somem se você:

- limpar os dados/site do navegador,
- desinstalar o app,
- trocar de celular.

Use **Ajustes → Exportar tudo (JSON)** de vez em quando e guarde o arquivo em algum lugar
seguro (e-mail, nuvem, computador). Para restaurar ou levar para outro aparelho: **Importar
backup** — dá para substituir tudo ou mesclar com o que já existe. É também assim que se
copia o histórico de um celular para o outro.

## Sobre os lembretes

O lembrete é local — não há servidor enviando push. Na prática:

- O aviso dentro do app (banner na tela inicial, com os dias de atraso) é sempre confiável.
- A notificação do sistema dispara quando o app está aberto ou rodando em segundo plano.
  Instalar na tela inicial e permitir notificações aumenta muito a chance de ela aparecer no
  horário; o iOS é mais restritivo que o Android nesse ponto.

## Estrutura

```
index.html              telas e navegação
assets/app.js           controlador (estado, formulários, lembretes, backup)
assets/db.js            IndexedDB: perfis, medições, fotos, configurações
assets/calc.js          campos, fórmulas e classificações
assets/charts.js        gráfico de linhas em SVG, sem dependências
sw.js                   service worker (offline + clique na notificação)
manifest.webmanifest    instalação como app
```

Sem build, sem dependências: é HTML, CSS e JavaScript puro.
