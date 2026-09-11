const nav = ['Onboarding', 'Expenses', 'Leave policy'];
document.getElementById('app').innerHTML =
  `<h1>Team handbook</h1>
   <p>Updated 4 September. Three sections are new this week.</p>
   <ul>${nav.map(n => `<li><a href="/${n.toLowerCase()}">${n}</a></li>`).join('')}</ul>`;
