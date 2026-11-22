<script setup>
// Body + footer of the home poster, the one for the entrance of a parish: the schedule, the
// contact details, the networks and the QR of the site. See buildHomeModel (posterModel.js).
import { shortUrl } from "./posterModel.js";
defineProps({ m: Object, title: String, qr: Object, showDescription: Boolean, showPhone: Boolean, scale: { type: Number, default: 1 } });
</script>

<template>
  <section class="pz-body pz-homebody">
    <h1 class="pz-title">{{ title }}</h1>
    <p v-if="showDescription && m.description" class="pz-desc">{{ m.description }}</p>
    <h2 v-if="m.groups.length" class="pz-h2">{{ m.scheduleTitle }}<span v-if="m.scheduleTitle2" class="pz-soft"> / {{ m.scheduleTitle2 }}</span></h2>
    <div class="pz-sched" :style="{ '--ls': scale }">
      <div v-for="g in m.groups" :key="g.key" class="pz-group">
        <h3>{{ g.heading }}<span v-if="g.heading2" class="pz-soft"> / {{ g.heading2 }}</span></h3>
        <ul>
          <li v-for="(l, i) in g.lines" :key="i"><b v-if="l.time">{{ l.time }}</b> <span>{{ l.text }}</span><span v-if="l.text2" class="pz-soft"> / {{ l.text2 }}</span></li>
        </ul>
      </div>
    </div>
  </section>

  <footer class="pz-foot pz-homefoot">
    <div v-if="qr" class="pz-qr">
      <svg :viewBox="`-2 -2 ${qr.size + 4} ${qr.size + 4}`" shape-rendering="crispEdges" role="img" aria-label="QR">
        <rect :x="-2" :y="-2" :width="qr.size + 4" :height="qr.size + 4" fill="#fff" />
        <path :d="qr.path" fill="#000" />
      </svg>
    </div>
    <div class="pz-foot-text">
      <p v-if="showPhone && (m.contacts.length || m.emails.length)" class="pz-cta">{{ m.labels.contact }}</p>
      <template v-if="showPhone">
        <p v-for="(c, i) in m.contacts.slice(0, 3)" :key="'p' + i" class="pz-phone">{{ c.phone }}<span v-if="c.name"> · {{ c.name }}</span></p>
        <p v-for="e in m.emails.slice(0, 2)" :key="e" class="pz-mail">{{ e }}</p>
      </template>
      <p v-if="m.social.length" class="pz-social"><b>{{ m.labels.follow }}</b> {{ m.social.slice(0, 4).join("  ·  ") }}</p>
      <p v-if="qr" class="pz-url">{{ shortUrl(m.pageUrl) }}</p>
    </div>
  </footer>
</template>
