# 6a7 — versão 0.9

Futebol em navegador: monte seleções históricas por sorteio, dispute o campeonato de 16 seleções e assista à final em 3D (ou jogue, no modo Jogador).


- **Clássico**: 16 seleções em 4 grupos (3 rodadas) → quartas → semifinais → final 3D. Vagas sem jogador humano são preenchidas por bots.
- **Almanaque**: mesmo campeonato, overalls ocultos durante o draft.
- **Caos**: 2 minutos, evento a cada 30 s; nos últimos 40 s, CAOS TOTAL. Eventos: bola gigante/pequena, supervelocidade, campo escorregadio, gravidade baixa, chuva de bolas, explosão do goleiro, terremoto, troca de posições, chute poderoso, cabeção, inversão, meteoro, fogo, cachorros, bola pesada, pulo e o raro VOCÊ JOGA.
- **VsRelógio**: sem espera entre participantes e trocas de seleção/Copa ilimitadas.
- **Jogador**: como no Clássico, mas você controla seus atletas na final (WASD/setas, Espaço para chutar, E passar, Q trocar; no celular há joystick e botões).

## Regras do draft

- Cada vez que você rola, aparece uma seleção e uma Copa. Escolha **um** jogador entre os que cabem em uma vaga livre da formação.
- Até 5 trocas de seleção e 5 de Copa por jogador (ilimitadas no VsRelógio).
- Turnos de 60 s; em caso de tempo esgotado ou desconexão, o servidor escolhe por você.
- Cada jogador histórico só pode aparecer uma vez por partida.

## Arquitetura

- `server.js`: Express + Socket.IO.
- `lib/data.js`: elencos (`data/squads.json`), formações, atribuição de posições e sorteio.
- `lib/rooms.js`: salas, turnos, campeonato, partida (o anfitrião simula e transmite; se ele cair, o servidor resolve a partida).
- `lib/tournament.js`: grupos, mata-mata, pênaltis.
- `lib/sim.js`: simulação estatística das fases que não são em 3D.
- `public/js/engine.js`: física e IA da partida 3D (roda no navegador e no Node para testes).
- `public/js/view3d.js`: renderização Three.js; personagens usam a textura do Steve com uniforme da seleção.
- `test/`: testes de salas, campeonato e simulação.

## Limitações conhecidas

- O estado das salas fica em memória: reiniciar o servidor encerra as partidas.
- A IA e o balanceamento foram ajustados por simulação, não por jogo humano extensivo.
- Seleções de memes (`data/memes.json`) são um conjunto inicial de 2 elencos.
- precisa ligar manualmente
- 
