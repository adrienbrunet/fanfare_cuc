# -*- coding: utf-8 -*-
# Generated by Django 1.11 on 2017-04-30 18:41
from __future__ import unicode_literals

import django.contrib.postgres.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='QuestionPage',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=255)),
                ('answers', django.contrib.postgres.fields.ArrayField(base_field=models.CharField(blank=True, max_length=1024), size=None)),
            ],
        ),
    ]