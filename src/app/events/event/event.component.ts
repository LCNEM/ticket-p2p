import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router'
import { GlobalDataService } from '../../services/global-data.service';
import { MatDialog, MatTableDataSource, MatPaginator } from '@angular/material';
import { HttpClient } from '@angular/common/http';
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFireAuth } from '@angular/fire/auth';
import { AlertDialogComponent } from '../../components/alert-dialog/alert-dialog.component';
import { PromptDialogComponent } from '../../components/prompt-dialog/prompt-dialog.component';
import { Event } from '../../../models/event';
import { firestore } from 'firebase';

declare let Stripe: any;

const stripePublicKey =
  "pk_live_U7J2IacDFZyCvYILl45onao9";
  //"pk_test_sVIc8W1jrazk2t1LxqAdnls3";

@Component({
  selector: 'app-event',
  templateUrl: './event.component.html',
  styleUrls: ['./event.component.css']
})
export class EventComponent implements OnInit {
  public loading = true;
  public id?: string;
  public event!: Event;
  public userId?: string;

  public dataSource?: MatTableDataSource<{
    timestamp: string,
    address: string
  }>;
  public displayedColumns = ["timestamp", "address"];
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(
    public global: GlobalDataService,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private http: HttpClient,
    private auth: AngularFireAuth,
    private firestore: AngularFirestore
  ) {
  }

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || undefined;

    this.auth.authState.subscribe(async (user) => {
      if (user == null) {
        this.router.navigate(["accounts", "login"]);
        return;
      }
      await this.global.initialize();
      await this.initialize();

      this.loading = false;
    });
  }

  public async initialize() {
    this.event = this.global.events![this.id!];

    if (!this.event || this.event.archived) {
      this.dialog.open(AlertDialogComponent, {
        data: {
          title: this.translation.error[this.global.lang],
          content: ""
        }
      }).afterClosed().subscribe(() => {
        this.router.navigate([""]);
      });
    }
    this.userId = this.auth.auth.currentUser!.uid;

    let tableData = [];

    let purchases = await this.firestore.collection("users").doc(this.userId).collection("events").doc(this.id!).collection("purchases").ref.get();
    for(let i = 0; i < purchases.size; i++) {
      let data = purchases.docs[i].data();
      if(data) {
        tableData.push({
          timestamp: data.createdAt && (data.createdAt as firestore.Timestamp).toDate().toTimeString(),
          address: data.address
        });
      }
    }
    this.dataSource = new MatTableDataSource(tableData);
    this.dataSource.paginator = this.paginator;
  }

  public async refresh() {
    this.loading = true;

    await this.global.refresh();
    await this.initialize();

    this.loading = false;
  }

  public async editEventName() {
    this.dialog.open(PromptDialogComponent, {
      data: {
        title: this.translation.edit[this.global.lang],
        input: {
          value: this.event.name,
          placeholder: this.translation.eventName[this.global.lang]
        }
      }
    }).afterClosed().subscribe(async (result) => {
      if (!result || this.event.name == result) {
        return;
      }

      let uid = this.auth.auth.currentUser!.uid;

      await this.firestore.collection("users").doc(uid).collection("events").doc(this.id!).set({
        name: result
      }, { merge: true });

      await this.refresh();
    });
  }

  public async capacitySupplement() {
    this.dialog.open(PromptDialogComponent, {
      data: {
        title: this.translation.supplement[this.global.lang],
        input: {
          type: "number",
          placeholder: this.translation.capacity[this.global.lang],
          min: 1
        }
      }
    }).afterClosed().subscribe(async (result) => {
      if (!result) {
        return;
      }
      await this.chargeCreditCard(result);
    });
  }

  public async chargeCreditCard(capacity: number) {
    if (!(window as any).PaymentRequest) {
      this.dialog.open(AlertDialogComponent, {
        data: {
          title: this.translation.error[this.global.lang],
          content: ""
        }
      });
      return;
    }
    let supportedInstruments: PaymentMethodData[] = [{
      supportedMethods: ['basic-card'],
      data: {
        supportedNetworks: [
          'visa',
          'mastercard',
          'amex',
          'diners',
          'jcb'
        ]
      }
    }];

    let details = {
      displayItems: [
        {
          label: `${this.translation.fee[this.global.lang]}: 50 * ${capacity}`,
          amount: {
            currency: "JPY",
            value: (capacity * 50).toString()
          }
        },
        {
          label: `${this.translation.tax[this.global.lang]}: 4 * ${capacity}`,
          amount: {
            currency: "JPY",
            value: (capacity * 4).toString()
          }
        }
      ],
      total: {
        label: this.translation.total[this.global.lang],
        amount: {
          currency: "JPY",
          value: (capacity * 54).toString()
        }
      }
    };

    let request = new PaymentRequest(supportedInstruments, details, { requestShipping: false });

    let result = await request.show();
    if (!result) {
      return;
    }

    Stripe.setPublishableKey(stripePublicKey);
    Stripe.card.createToken({
      number: result.details.cardNumber,
      cvc: result.details.cardSecurityCode,
      exp_month: result.details.expiryMonth,
      exp_year: result.details.expiryYear
    }, async (status: any, response: any) => {
      if (response.error) {
        result.complete("fail");

        return;
      }

      try {
        await this.http.post(
          "https://us-central1-ticket-p2p.cloudfunctions.net/capacitySupplement",
          {
            userId: this.auth.auth.currentUser!.uid,
            eventId: this.id,
            capacity: capacity,
            token: response.id
          }
        ).toPromise();

        result.complete("success");

        this.dialog.open(AlertDialogComponent, {
          data: {
            title: this.translation.completed[this.global.lang],
            content: ""
          }
        }).afterClosed().subscribe(async () => {
          await this.refresh();
        });
      } catch {
        this.dialog.open(AlertDialogComponent, {
          data: {
            title: this.translation.error[this.global.lang],
            content: ""
          }
        });

        result.complete("fail");
      }
    });
  }

  public translation = {
    amount: {
      en: "Amount",
      ja: "金額"
    },
    error: {
      en: "Error",
      ja: "エラー"
    },
    completed: {
      en: "Completed",
      ja: "完了"
    },
    unsupported: {
      en: "Request Payment API is not supported in this browser.",
      ja: "Request Payment APIがこのブラウザではサポートされていません。"
    },
    fee: {
      en: "Fee",
      ja: "手数料"
    },
    tax: {
      en: "Consumption tax",
      ja: "消費税"
    },
    total: {
      en: "Total",
      ja: "合計"
    },
    eventId: {
      en: "Event ID",
      ja: "イベントID"
    },
    eventName: {
      en: "Event name",
      ja: "イベント名"
    },
    edit: {
      en: "Edit",
      ja: "編集"
    },
    capacity: {
      en: "Capacity",
      ja: "定員"
    },
    supplement: {
      en: "Supplement",
      ja: "枠追加"
    },
    userId: {
      en: "User ID",
      ja: "ユーザーID"
    },
    timestamp: {
      en: "Timestamp",
      ja: "タイムスタンプ"
    },
    address: {
      en: "Address",
      ja: "アドレス"
    }
  } as { [key: string]: { [key: string]: string } };
}
