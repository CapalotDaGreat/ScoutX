(() => {
  const navigation = document.querySelector('.navigation');
  if (!(navigation instanceof HTMLDetailsElement)) return;

  const compact = window.matchMedia('(max-width: 800px)');
  const syncNavigation = () => { navigation.open = !compact.matches; };
  syncNavigation();
  compact.addEventListener('change', syncNavigation);

  navigation.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !navigation.open || !compact.matches) return;
    navigation.open = false;
    navigation.querySelector('summary')?.focus();
  });

  const openLinkedAnswer = () => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const answer = document.getElementById(id);
    if (answer instanceof HTMLDetailsElement && answer.classList.contains('faq-item')) {
      answer.open = true;
    }
  };
  openLinkedAnswer();
  window.addEventListener('hashchange', openLinkedAnswer);
})();
