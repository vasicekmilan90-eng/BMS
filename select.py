from homeassistant.components.select import SelectEntity
from homeassistant.helpers.restore_state import RestoreEntity
from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([BMSProfileSelect(hass, entry), BMSPrepocetSelect(entry)])


class BMSProfileSelect(SelectEntity, RestoreEntity):
    """Select aktivního profilu křivky — pamatuje si poslední volbu přes restart."""

    def __init__(self, hass, entry):
        self._hass = hass
        self._entry = entry
        self._attr_name = "BMS Profil křivky"
        self.entity_id = "select.bms_profil_krivky"
        self._attr_unique_id = f"{entry.entry_id}_profile_select"
        self._attr_current_option = "Výchozí"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "BMS Regulátor",
        }

    async def async_added_to_hass(self) -> None:
        """Obnovit poslední vybraný profil po restartu."""
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state and last.state not in ("unknown", "unavailable"):
            profiles = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {}).get("profiles", {})
            if last.state == "Výchozí" or last.state in profiles:
                self._attr_current_option = last.state
        self.async_write_ha_state()

    @property
    def options(self) -> list[str]:
        profiles = self._hass.data[DOMAIN][self._entry.entry_id].get("profiles", {})
        return ["Výchozí"] + sorted(
            k for k in profiles if k != "Výchozí" and not k.startswith("__")
        )

    async def async_select_option(self, option: str) -> None:
        if option != "Výchozí":
            await self._hass.services.async_call(
                DOMAIN, "load_profile", {"name": option}, blocking=True
            )
        self._attr_current_option = option
        self.async_write_ha_state()


class BMSPrepocetSelect(SelectEntity, RestoreEntity):
    """Select pro volbu režimu přepočtu (čas / teplota / obojí)."""
    _OPTIONS = ["cas", "teplota", "oboji"]

    def __init__(self, entry):
        self._entry = entry
        self._attr_name = "BMS Přepočet: Režim"
        self.entity_id = "select.bms_prepocet_rezim"
        self._attr_unique_id = f"{entry.entry_id}_prepocet_rezim"
        self._attr_options = self._OPTIONS
        self._attr_current_option = "cas"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "BMS Regulátor",
        }

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state in self._OPTIONS:
            self._attr_current_option = last.state
        self.async_write_ha_state()

    async def async_select_option(self, option: str) -> None:
        if option in self._OPTIONS:
            self._attr_current_option = option
            self.async_write_ha_state()