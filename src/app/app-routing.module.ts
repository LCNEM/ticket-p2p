import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { LoginComponent } from './accounts/login/login.component';
import { PageNotFoundComponent } from './error/page-not-found/page-not-found.component';
import { EventComponent } from './events/event/event.component';
import { ScanComponent } from './events/scan/scan.component';
import { ArchivedComponent } from './events/archived/archived.component';

const routes: Routes = [
  {path: "", component: HomeComponent},
  {path: "accounts/login", component: LoginComponent},
  {path: "events/archived", component: ArchivedComponent},
  {path: "events/:id", component: EventComponent},
  {path: "events/:eventId/scan", component: ScanComponent},
  {path: "**", component: PageNotFoundComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
