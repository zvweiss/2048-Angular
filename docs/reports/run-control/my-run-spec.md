 # Terminology

 ## What is a Board?

 A Board is a 4x4 grid of cells (matrix) stored in memory as a two dimentional array [][]. A cell is either emppty (epresented by the value 0) or contain a tileValue. A tileValue is an integer > 0. 

 ## What is a cell?

 A Cell is an  

 A spawn is an array with four values. [tileValue, row, col, direction]. A tileValue an integer  is a set of 3 integers(tileValue, row, col) in which tileValue is a an integer of value 2 or 4 with a coresponding distribution of 90% and 10%. row and col are an integer with a value between 0 to 3


 
A Normal mode starts with a Board populated with two spawned tiles. A spawed tile is a set of 3 integers(tileValue, row, col) in which tileValue is a an integer of value 2 or 4 with a coresponding distribution of 90% and 10%. row and col are an integer with a value between 0 to 3. The first two spawned tile do have a move (which actullay is a misdendomer to direction) associated with them. All subsequent spawns are a set of four integers (tileValue, col, row, direction) in which direction is set by s step done by a human one at a time or is value computed by the AI in a continous fashion. A normal run completes when there are empty cells on the board. A record is a normal game in which all the spawns are saved in memory dureing the run. the last spawn is computed before the run completes with Game Over for a record run the list of spawns must be either Saved into a persistent memory in our case localStorage. A record can a list of spawns saved in a stopped run (i.e. did not reach game Over as a reult of stopping the AI. run and Game are synonyms. Replay is a run consuming spawns Savesd as a result of record run. A record run may contain AI steps as well as manual steps. A record run may be be Saved when the run reaches Game Over or from a stopped run in progess i.e. can continue by AI or manual steps. All run modes can be stopped and be in progress. stopped while in progress may be abandoned or Save it spawns if it is a record run Game over record run is listed in Runs with an Outcome of Complete of Stopped