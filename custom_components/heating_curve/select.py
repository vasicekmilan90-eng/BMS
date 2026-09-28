from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN, EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import HeatingCurveConfigEntry
from .const import DEFAULT_PROFILE, DOMAIN
from .entity import BMSEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HeatingCurveConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    profile_select = BMSProfileSelect(hass, entry)
    entry.runtime_data["profile_select"] = profile_select
    async_add_entities([profile_select, BMSPrepocetSelect(entry)])


class BMSProfileSelect(BMSEntity, SelectEntity, RestoreEntity):
    """Select aktivního profilu křivky — pamatuje si poslední volbu přes restart."""

    def __init__(self, hass: HomeAssistant, entry: HeatingCurveConfigEntry) -> None:
        super().__init__(entry, "select", "profil_krivky", "Profil křivky")
        self._hass = hass
        self._attr_unique_id = f"{entry.entry_id}_profile_select"
        self._attr_current_option = DEFAULT_PROFILE

    async def async_added_to_hass(self) -> None:
        """Obnovit poslední vybraný profil po restartu."""
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state and last.state not in (STATE_UNKNOWN, STATE_UNAVAILABLE):
            profiles = self._entry.runtime_data.get("profiles", {})
            if last.state == DEFAULT_PROFILE or last.state in profiles:
                self._attr_current_option = last.state

    @property
    def options(self) -> list[str]:
        profiles = self._entry.runtime_data.get("profiles", {})
        return [DEFAULT_PROFILE] + sorted(
            k for k in profiles if k != DEFAULT_PROFILE and not k.startswith("__")
        )

    @callback
    def async_set_active_profile(self, option: str | None = None) -> None:
        """Nastaví aktivní profil (None = ponechat) a zapíše stav vč. aktuálních možností."""
        if option is not None:
            self._attr_current_option = option
        if self.hass is not None:
            self.async_write_ha_state()

    async def async_select_option(self, option: str) -> None:
        if option != DEFAULT_PROFILE:
            await self._hass.services.async_call(
                DOMAIN, "load_profile", {"name": option}, blocking=True
            )
        self._attr_current_option = option
        self.async_write_ha_state()


class BMSPrepocetSelect(BMSEntity, SelectEntity, RestoreEntity):
    """Select pro volbu režimu přepočtu (čas / teplota / obojí)."""

    _OPTIONS = ["cas", "teplota", "oboji"]
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, entry: HeatingCurveConfigEntry) -> None:
        super().__init__(entry, "select", "prepocet_rezim", "Přepočet: Režim")
        self._attr_unique_id = f"{entry.entry_id}_prepocet_rezim"
        self._attr_options = self._OPTIONS
        self._attr_current_option = "cas"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state in self._OPTIONS:
            self._attr_current_option = last.state

    async def async_select_option(self, option: str) -> None:
        if option in self._OPTIONS:
            self._attr_current_option = option
            self.async_write_ha_state()
