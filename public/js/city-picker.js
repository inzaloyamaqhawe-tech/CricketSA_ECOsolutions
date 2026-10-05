// Cascading country -> city/town picker, shared by register.html and
// profile.html. Requires countries.js (COUNTRIES / CITY_OPTIONS /
// SOUTH_AFRICA_CITIES) to be loaded first.
//
// wireCityPicker(countryInputId, citySelectId, otherInputId) wires the three
// elements together and returns { setCountry(value), setCity(value),
// getCity() } so callers can pre-fill (edit forms) and read back the result.
function citiesForCountry(country) {
  const normalized = (country || '').trim().toLowerCase();
  if (normalized === 'south africa') return SOUTH_AFRICA_CITIES;
  const match = Object.keys(CITY_OPTIONS).find((c) => c.toLowerCase() === normalized);
  return match ? CITY_OPTIONS[match] : [];
}

function wireCityPicker(countryInputId, citySelectId, otherInputId) {
  const countryInput = document.getElementById(countryInputId);
  const citySelect = document.getElementById(citySelectId);
  const otherInput = document.getElementById(otherInputId);

  function refreshOptions(keepValue) {
    const country = countryInput.value;
    const cities = country.trim() ? citiesForCountry(country) : [];
    const options = [...cities, 'Other'];
    citySelect.innerHTML = (country.trim() ? '<option value="">Choose a city...</option>' : '<option value="">Choose a country first...</option>')
      + options.map((c) => `<option value="${c}">${c}</option>`).join('');
    if (keepValue && options.includes(keepValue)) {
      citySelect.value = keepValue;
    } else {
      otherInput.classList.add('hidden');
      otherInput.value = '';
    }
  }

  countryInput.addEventListener('input', () => refreshOptions());
  countryInput.addEventListener('change', () => refreshOptions());
  citySelect.addEventListener('change', (e) => {
    if (e.target.value === 'Other') {
      otherInput.classList.remove('hidden');
      otherInput.focus();
    } else {
      otherInput.classList.add('hidden');
      otherInput.value = '';
    }
  });

  return {
    setCountry(value) { countryInput.value = value || ''; refreshOptions(); },
    setCity(value, cities) {
      // If value isn't one of the preset options, treat it as a custom "Other" city.
      const options = cities || citiesForCountry(countryInput.value);
      if (value && !options.includes(value)) {
        refreshOptions();
        citySelect.value = 'Other';
        otherInput.classList.remove('hidden');
        otherInput.value = value;
      } else {
        refreshOptions(value);
      }
    },
    getCity() { return citySelect.value === 'Other' ? otherInput.value.trim() : citySelect.value; },
  };
}
