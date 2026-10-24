# Cervejas — histórico e avaliações

App pessoal (PWA) para registrar as cervejas que você bebe: foto, quantidade, embalagem, local,
preço e avaliação. Funciona offline, instala na tela inicial do iPhone e **guarda tudo apenas
no aparelho**. Não tem servidor nem conta.

Publicado junto com o resto do repositório no GitHub Pages, em `https://<usuário>.github.io/<repositório>/cervejas/`.

## Abas

- **Biblioteca**: tudo o que você já bebeu. Tem busca por texto (nome, cervejaria, estilo, país,
  local e notas, sem diferenciar acentos) e filtros por estilo, perfil (amarga, doce, ácida,
  maltada, lupulada, torrada) e nota mínima, além de ordenação. Alterna entre **Cervejas** (um
  card por rótulo) e **Histórico** (cada vez que você bebeu, mês a mês).
- **Registrar**: foto, dados da cerveja, consumo (data, local, embalagem, quantidade, preço) e
  avaliação. Ao digitar o nome, sugere cervejas já cadastradas; escolhendo uma, o registro entra
  no histórico dela em vez de criar uma duplicata.
- **Explorar**: números gerais, “Me sugere uma” (sorteio entre as que você deu nota ≥ 7,5),
  ranking top 10, duelo entre duas cervejas (radar e tabela), consumo por mês, resumo por estilo
  e “Gosto × técnica” (onde a sua nota mais se afastou da nota técnica).
- **Ajustes**: backup/restauração em JSON (com as fotos), exportação CSV e o guia das escalas.

## Avaliação

| Nota | Como sai |
|---|---|
| **Nota geral 0–10** | Puramente subjetiva: o quanto você gostou. É a que manda no ranking e na biblioteca. |
| **Nota técnica 0–10** | Média ponderada de seis fatores (0–5), convertida para 0–10. Só é calculada com os seis preenchidos. |

| Fator | Peso | O que observar |
|---|---|---|
| Aparência | 10% | Cor, limpidez e espuma |
| Aroma | 20% | Intensidade e qualidade |
| Sabor | 30% | Qualidade e complexidade |
| Corpo | 10% | Textura, carbonatação |
| Equilíbrio | 15% | Malte × lúpulo × álcool |
| Final | 15% | Retrogosto, vontade de beber outra |

Cada nível de 0 a 5 tem uma descrição no app, para manter a consistência entre avaliações.

O **perfil de sabor** (amargor, dulçor, acidez, malte, lúpulo e torra, de 0 a 5) descreve a
cerveja e não entra na nota. Quando a média de um descritor chega a 3,5, a cerveja ganha a
etiqueta correspondente (ex.: “Amarga”), que pode ser usada no filtro.

Se você bebe a mesma cerveja de novo, toque em **Bebi de novo**. As notas dela passam a ser a
média de todas as avaliações.

## Instalar no iPhone

1. Abra o endereço no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Abra pelo ícone: o app fica em tela cheia e funciona sem internet.

## Backup (importante)

Os dados ficam no armazenamento do app no iPhone. Se você remover o app da tela inicial ou apagar
os dados do Safari, **eles se perdem**. Em **Ajustes → Fazer backup**, o iPhone abre a folha de
compartilhamento. Escolha **Salvar em Arquivos**, de preferência no iCloud Drive. Para restaurar,
use **Restaurar backup** e selecione o arquivo. A restauração junta o backup com os dados atuais
e não apaga nada.

## Rodar localmente

```bash
python3 -m http.server 8000   # na raiz do repositório
# abra http://localhost:8000/cervejas/
```
