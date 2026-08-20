so i always do:

fetch('/api/telematics/eagletrack/sync', { method: 'POST' })
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)));

  ###################
  cmd curl
  >
  curl -v "https://eaglegps.gtrack.co/api2/last?user=Willsgrove&token=1c44f7jet12nhb4rb6ilnides3"